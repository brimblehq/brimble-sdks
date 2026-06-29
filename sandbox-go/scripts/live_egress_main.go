package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	sandbox "github.com/brimblehq/brimble-sdks/sandbox-go"
)

const (
	networkSwitchWait = 25 * time.Second
	probeCmd          = "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://1.1.1.1 || echo 000"
)

func probeHTTP(ctx context.Context, handle *sandbox.SandboxHandle) (string, error) {
	result, err := handle.Exec(ctx, sandbox.ExecInput{Cmd: probeCmd})
	if err != nil {
		return "", err
	}

	digits := strings.Builder{}
	for _, ch := range strings.TrimSpace(result.Stdout) {
		if ch >= '0' && ch <= '9' {
			digits.WriteRune(ch)
		}
	}

	code := digits.String()
	if len(code) >= 3 {
		return code[:3], nil
	}
	if code == "" {
		return "000", nil
	}
	return code, nil
}

func assertStep(label, actual, expected string) {
	ok := actual == expected
	status := "PASS"
	if !ok {
		status = "FAIL"
	}
	fmt.Printf("%s %s: got %s, expected %s\n", status, label, actual, expected)
	if !ok {
		os.Exit(1)
	}
}

func main() {
	apiKey := os.Getenv(sandbox.SandboxAPIKeyEnvName)
	if apiKey == "" {
		fmt.Println("Set BRIMBLE_SANDBOX_KEY to run this script.")
		os.Exit(1)
	}

	client, err := sandbox.NewClient(sandbox.ClientConfig{APIKey: apiKey})
	if err != nil {
		fmt.Printf("new client: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()

	fmt.Println("Creating sandbox with deny_all egress...")
	handle, err := client.Sandboxes.Create(ctx, sandbox.CreateSandboxRequest{
		Template: "node-22",
		Egress: &sandbox.SandboxEgressConfig{
			Mode: sandbox.SandboxEgressModeDenyAll,
		},
	})
	if err != nil {
		fmt.Printf("create sandbox: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Sandbox id: %s\n", handle.ID())

	defer func() {
		fmt.Println("\nDestroying sandbox...")
		if destroyErr := handle.Destroy(ctx); destroyErr != nil {
			fmt.Printf("Cleanup failed: %v\n", destroyErr)
			return
		}
		fmt.Println("Sandbox destroyed.")
	}()

	if _, err = handle.WaitUntilReady(ctx); err != nil {
		fmt.Printf("wait until ready: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Sandbox ready.\n")

	denied, err := probeHTTP(ctx, handle)
	if err != nil {
		fmt.Printf("probe deny_all: %v\n", err)
		os.Exit(1)
	}
	assertStep("deny_all blocks outbound", denied, "000")

	fmt.Println("\nUpdating egress to restricted (allow 1.1.1.1)...")
	restricted, err := handle.UpdateEgress(ctx, sandbox.UpdateSandboxEgressInput{
		Mode:  sandbox.SandboxEgressModeRestricted,
		Allow: []string{"1.1.1.1"},
	})
	if err != nil {
		fmt.Printf("update restricted: %v\n", err)
		os.Exit(1)
	}
	networkUpdated := restricted.NetworkUpdated != nil && *restricted.NetworkUpdated
	fmt.Printf("  egress.mode=%s, network_updated=%v\n", restricted.Egress.Mode, networkUpdated)

	time.Sleep(networkSwitchWait)

	allowed, err := probeHTTP(ctx, handle)
	if err != nil {
		fmt.Printf("probe restricted: %v\n", err)
		os.Exit(1)
	}
	assertStep("restricted allows 1.1.1.1", allowed, "301")

	fmt.Println("\nUpdating egress to open...")
	openResult, err := handle.UpdateEgress(ctx, sandbox.UpdateSandboxEgressInput{
		Mode: sandbox.SandboxEgressModeOpen,
	})
	if err != nil {
		fmt.Printf("update open: %v\n", err)
		os.Exit(1)
	}
	openNetworkUpdated := openResult.NetworkUpdated != nil && *openResult.NetworkUpdated
	fmt.Printf("  egress.mode=%s, network_updated=%v\n", openResult.Egress.Mode, openNetworkUpdated)

	if openNetworkUpdated {
		time.Sleep(networkSwitchWait)
	}

	openProbe, err := probeHTTP(ctx, handle)
	if err != nil {
		fmt.Printf("probe open: %v\n", err)
		os.Exit(1)
	}
	assertStep("open allows outbound", openProbe, "301")

	fmt.Println("\nAll egress SDK checks passed.")
}
