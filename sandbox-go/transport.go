package sandbox

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

type envelope struct {
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func normalizeRetry(input *RetryOptions) RetryOptions {
	normalized := RetryOptions{
		MaxAttempts:  DefaultRetryMaxAttempts,
		BaseDelay:    DefaultRetryBaseDelay,
		MaxDelay:     DefaultRetryMaxDelay,
		RetryStatus:  append([]int{}, DefaultRetryStatuses...),
		RetryMethods: append([]string{}, DefaultRetryMethods...),
	}

	if input == nil {
		return normalized
	}

	if input.MaxAttempts > 0 {
		normalized.MaxAttempts = input.MaxAttempts
	}
	if input.BaseDelay > 0 {
		normalized.BaseDelay = input.BaseDelay
	}
	if input.MaxDelay > 0 {
		normalized.MaxDelay = input.MaxDelay
	}
	if len(input.RetryStatus) > 0 {
		normalized.RetryStatus = append([]int{}, input.RetryStatus...)
	}
	if len(input.RetryMethods) > 0 {
		methods := make([]string, 0, len(input.RetryMethods))
		for _, method := range input.RetryMethods {
			methods = append(methods, strings.ToUpper(method))
		}
		normalized.RetryMethods = methods
	}

	return normalized
}

func mergeRetry(base RetryOptions, request *RequestOptions) RetryOptions {
	if request == nil {
		return base
	}
	if request.DisableRetry {
		base.MaxAttempts = 1
		return base
	}
	if request.Retry == nil {
		return base
	}
	return normalizeRetry(request.Retry)
}

func (c *Client) buildURL(endpoint string, query map[string]string) (string, error) {
	base := strings.TrimSuffix(c.baseURL, "/")
	path := endpoint
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	u, err := url.Parse(base + path)
	if err != nil {
		return "", err
	}

	if len(query) > 0 {
		values := url.Values{}
		for key, value := range query {
			if value == "" {
				continue
			}
			values.Set(key, value)
		}
		u.RawQuery = values.Encode()
	}

	return u.String(), nil
}

func (c *Client) newRequest(
	ctx context.Context,
	method string,
	endpoint string,
	query map[string]string,
	body io.Reader,
	requestOptions *RequestOptions,
) (*http.Request, error) {
	endpointURL, err := c.buildURL(endpoint, query)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, method, endpointURL, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("x-brimble-key", c.apiKey)
	req.Header.Set("source", "sdk-package")
	req.Header.Set("source-version", SDKPackageVersion)
	if requestOptions != nil && requestOptions.IdempotencyKey != "" {
		req.Header.Set("idempotency-key", requestOptions.IdempotencyKey)
	}

	return req, nil
}

func parseErrorMessage(resp *http.Response, raw []byte) string {
	if len(raw) > 0 {
		var parsed map[string]any
		if err := json.Unmarshal(raw, &parsed); err == nil {
			if message, ok := parsed["message"].(string); ok && message != "" {
				return message
			}
		}
		trimmed := strings.TrimSpace(string(raw))
		if trimmed != "" {
			return trimmed
		}
	}

	if resp.Status != "" {
		return resp.Status
	}

	return "sandbox API request failed"
}

func containsInt(values []int, expected int) bool {
	return slices.Contains(values, expected)
}

func containsMethod(values []string, expected string) bool {
	return slices.ContainsFunc(values, func(value string) bool {
		return strings.EqualFold(value, expected)
	})
}

func retryDelay(attempt int, base time.Duration, max time.Duration) time.Duration {
	delay := base * time.Duration(1<<(attempt-1))
	if delay > max {
		return max
	}
	return delay
}

func requestID(resp *http.Response) string {
	if value := resp.Header.Get("x-request-id"); value != "" {
		return value
	}
	return resp.Header.Get("x-correlation-id")
}

func retryAfterSeconds(resp *http.Response) *float64 {
	raw := resp.Header.Get("retry-after")
	if raw == "" {
		return nil
	}
	parsed, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func buildAPIError(resp *http.Response, method string, endpoint string, raw []byte) error {
	apiError := &APIError{
		Status:            resp.StatusCode,
		Message:           parseErrorMessage(resp, raw),
		Endpoint:          fmt.Sprintf("%s %s", method, endpoint),
		ResponseBody:      string(raw),
		RequestID:         requestID(resp),
		RetryAfterSeconds: retryAfterSeconds(resp),
	}

	switch resp.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return &AuthError{APIError: apiError}
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return &ValidationError{APIError: apiError}
	case http.StatusNotFound:
		return &NotFoundError{APIError: apiError}
	case http.StatusTooManyRequests:
		return &RateLimitError{APIError: apiError}
	default:
		return apiError
	}
}

func (c *Client) withTimeout(ctx context.Context, requestOptions *RequestOptions) (context.Context, context.CancelFunc) {
	if requestOptions == nil || requestOptions.Timeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, requestOptions.Timeout)
}

func (c *Client) doJSON(
	ctx context.Context,
	method string,
	endpoint string,
	query map[string]string,
	input any,
	out any,
) (envelope, error) {
	return c.doJSONWithOptions(ctx, method, endpoint, query, input, out, nil)
}

func (c *Client) doJSONWithOptions(
	ctx context.Context,
	method string,
	endpoint string,
	query map[string]string,
	input any,
	out any,
	requestOptions *RequestOptions,
) (envelope, error) {
	var payload []byte
	var err error
	if input != nil {
		payload, err = json.Marshal(input)
		if err != nil {
			return envelope{}, err
		}
	}

	method = strings.ToUpper(method)
	retry := mergeRetry(c.retry, requestOptions)
	canRetryMethod := containsMethod(retry.RetryMethods, method) || (method == http.MethodPost && requestOptions != nil && requestOptions.IdempotencyKey != "")

	for attempt := 1; attempt <= retry.MaxAttempts; attempt++ {
		attemptCtx, cancel := c.withTimeout(ctx, requestOptions)
		req, reqErr := c.newRequest(attemptCtx, method, endpoint, query, bytes.NewReader(payload), requestOptions)
		if reqErr != nil {
			cancel()
			return envelope{}, reqErr
		}
		if input != nil {
			req.Header.Set("content-type", "application/json")
		}

		resp, doErr := c.httpClient.Do(req)
		cancel()
		if doErr != nil {
			if attempt < retry.MaxAttempts && canRetryMethod {
				time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
				continue
			}
			return envelope{}, doErr
		}

		raw, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return envelope{}, readErr
		}

		if resp.StatusCode == http.StatusNoContent {
			return envelope{}, nil
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			if attempt < retry.MaxAttempts && canRetryMethod && containsInt(retry.RetryStatus, resp.StatusCode) {
				time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
				continue
			}
			return envelope{}, buildAPIError(resp, method, endpoint, raw)
		}

		if len(raw) == 0 {
			return envelope{}, nil
		}

		var env envelope
		if unmarshalErr := json.Unmarshal(raw, &env); unmarshalErr == nil && env.Message != "" {
			if out != nil {
				if len(env.Data) > 0 && string(env.Data) != "null" {
					if err := json.Unmarshal(env.Data, out); err != nil {
						return envelope{}, err
					}
				} else if ack, ok := out.(*AckMessage); ok {
					ack.Message = env.Message
				}
			}
			return env, nil
		}

		if out != nil {
			if err := json.Unmarshal(raw, out); err != nil {
				return envelope{}, err
			}
		}
		return envelope{}, nil
	}

	return envelope{}, fmt.Errorf("http request failed before receiving a response")
}

func (c *Client) doBinary(ctx context.Context, method string, endpoint string, query map[string]string, body io.Reader, contentLength int64) error {
	return c.doBinaryWithOptions(ctx, method, endpoint, query, body, contentLength, nil)
}

func (c *Client) doBinaryWithOptions(
	ctx context.Context,
	method string,
	endpoint string,
	query map[string]string,
	body io.Reader,
	contentLength int64,
	requestOptions *RequestOptions,
) error {
	method = strings.ToUpper(method)
	retry := mergeRetry(c.retry, requestOptions)
	canRetryMethod := containsMethod(retry.RetryMethods, method) || (method == http.MethodPost && requestOptions != nil && requestOptions.IdempotencyKey != "")

	for attempt := 1; attempt <= retry.MaxAttempts; attempt++ {
		attemptCtx, cancel := c.withTimeout(ctx, requestOptions)
		req, err := c.newRequest(attemptCtx, method, endpoint, query, body, requestOptions)
		if err != nil {
			cancel()
			return err
		}

		req.Header.Set("content-type", "application/octet-stream")
		if contentLength >= 0 {
			req.Header.Set("content-length", strconv.FormatInt(contentLength, 10))
		}

		resp, doErr := c.httpClient.Do(req)
		cancel()
		if doErr != nil {
			if attempt < retry.MaxAttempts && canRetryMethod {
				time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
				continue
			}
			return doErr
		}

		raw, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil
		}

		if attempt < retry.MaxAttempts && canRetryMethod && containsInt(retry.RetryStatus, resp.StatusCode) {
			time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
			continue
		}

		return buildAPIError(resp, method, endpoint, raw)
	}

	return fmt.Errorf("binary request failed before receiving a response")
}

func (c *Client) doStream(ctx context.Context, method string, endpoint string, query map[string]string) (io.ReadCloser, error) {
	return c.doStreamWithOptions(ctx, method, endpoint, query, nil)
}

func (c *Client) doStreamWithOptions(
	ctx context.Context,
	method string,
	endpoint string,
	query map[string]string,
	requestOptions *RequestOptions,
) (io.ReadCloser, error) {
	method = strings.ToUpper(method)
	retry := mergeRetry(c.retry, requestOptions)
	canRetryMethod := containsMethod(retry.RetryMethods, method)

	for attempt := 1; attempt <= retry.MaxAttempts; attempt++ {
		attemptCtx, cancel := c.withTimeout(ctx, requestOptions)
		req, err := c.newRequest(attemptCtx, method, endpoint, query, nil, requestOptions)
		if err != nil {
			cancel()
			return nil, err
		}

		resp, doErr := c.httpClient.Do(req)
		cancel()
		if doErr != nil {
			if attempt < retry.MaxAttempts && canRetryMethod {
				time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
				continue
			}
			return nil, doErr
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return resp.Body, nil
		}

		raw, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if attempt < retry.MaxAttempts && canRetryMethod && containsInt(retry.RetryStatus, resp.StatusCode) {
			time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
			continue
		}

		return nil, buildAPIError(resp, method, endpoint, raw)
	}

	return nil, fmt.Errorf("stream request failed before receiving a response")
}

func (c *Client) doSSEStream(ctx context.Context, method string, endpoint string, input any) (io.ReadCloser, error) {
	return c.doSSEStreamWithOptions(ctx, method, endpoint, input, nil)
}

func (c *Client) doSSEStreamWithOptions(
	ctx context.Context,
	method string,
	endpoint string,
	input any,
	requestOptions *RequestOptions,
) (io.ReadCloser, error) {
	payload, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}

	method = strings.ToUpper(method)
	retry := mergeRetry(c.retry, requestOptions)
	canRetryMethod := containsMethod(retry.RetryMethods, method) || (method == http.MethodPost && requestOptions != nil && requestOptions.IdempotencyKey != "")

	for attempt := 1; attempt <= retry.MaxAttempts; attempt++ {
		attemptCtx, cancel := c.withTimeout(ctx, requestOptions)
		req, reqErr := c.newRequest(attemptCtx, method, endpoint, nil, bytes.NewReader(payload), requestOptions)
		if reqErr != nil {
			cancel()
			return nil, reqErr
		}
		req.Header.Set("content-type", "application/json")

		resp, doErr := c.httpClient.Do(req)
		cancel()
		if doErr != nil {
			if attempt < retry.MaxAttempts && canRetryMethod {
				time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
				continue
			}
			return nil, doErr
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return resp.Body, nil
		}

		raw, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if attempt < retry.MaxAttempts && canRetryMethod && containsInt(retry.RetryStatus, resp.StatusCode) {
			time.Sleep(retryDelay(attempt, retry.BaseDelay, retry.MaxDelay))
			continue
		}

		return nil, buildAPIError(resp, method, endpoint, raw)
	}

	return nil, fmt.Errorf("sse stream request failed before receiving a response")
}
