package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	sandbox "github.com/brimblehq/brimble-sdks/sandbox-go"
)

func main() {
	apiKey := os.Getenv(sandbox.SandboxAPIKeyEnvName)
	if apiKey == "" {
		fmt.Println("Set BRIMBLE_SANDBOX_KEY")
		os.Exit(1)
	}

	ctx := context.Background()
	failed := false

	client, err := sandbox.NewClient(sandbox.ClientConfig{APIKey: apiKey})
	if err != nil {
		panic(err)
	}

	fmt.Println("Creating sandbox...")
	handle, err := client.Sandboxes.Create(ctx, sandbox.CreateSandboxRequest{
		Template: "node-22",
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Sandbox ready: %s\n\n", handle.ID())

	defer func() {
		fmt.Println("\nDestroying sandbox...")
		_ = handle.Destroy(ctx)
		fmt.Println("Sandbox destroyed.")
	}()

	fmt.Println("1) Buffered exec")
	buffered, err := handle.Exec(ctx, sandbox.ExecInput{Cmd: "echo hello-buffered"})
	if err != nil || buffered.ExitCode != 0 || !strings.Contains(buffered.Stdout, "hello-buffered") {
		failed = true
		fmt.Println("FAIL  buffered exec", buffered, err)
	} else {
		fmt.Println("PASS  buffered exec")
	}

	fmt.Println("\n2) Streaming exec (IterateLogs)")
	output, err := handle.ExecStream(ctx, sandbox.ExecInput{
		Cmd: "for i in 1 2 3; do echo line-$i; sleep 0.15; done",
	})
	if err != nil {
		panic(err)
	}
	defer output.Close()

	logCount := 0
	if err := output.IterateLogs(ctx, func(log sandbox.ExecLog) error {
		logCount++
		fmt.Printf("   [%s] %q\n", log.Stream, log.Data)
		return nil
	}); err != nil {
		failed = true
		fmt.Println("FAIL  iterate logs", err)
	}

	streamed, err := output.Result(ctx)
	if err != nil || logCount == 0 || streamed.ExitCode != 0 || !strings.Contains(streamed.Stdout, "line-1") {
		failed = true
		fmt.Println("FAIL  streaming exec", logCount, streamed, err)
	} else {
		fmt.Println("PASS  streaming exec")
	}

	fmt.Println("\n3) Callback exec")
	var chunks []string
	callback, err := handle.ExecWithHooks(ctx, sandbox.ExecInput{Cmd: "printf callback-ok"}, &sandbox.ExecHooks{
		OnStdout: func(chunk string) {
			chunks = append(chunks, chunk)
			fmt.Printf("   [callback] %q\n", chunk)
		},
	})
	if err != nil || len(chunks) == 0 || !strings.Contains(callback.Stdout, "callback-ok") {
		failed = true
		fmt.Println("FAIL  callback exec", chunks, callback, err)
	} else {
		fmt.Println("PASS  callback exec")
	}

	fmt.Println("\n4) Streaming runCode")
	codeOutput, err := handle.RunCodeStream(ctx, sandbox.CodeInput{
		Language: sandbox.CodeLanguageNode,
		Code:     "for (let i = 1; i <= 2; i++) console.log(`code-${i}`)",
	})
	if err != nil {
		panic(err)
	}
	defer codeOutput.Close()

	codeLogs := 0
	_ = codeOutput.IterateLogs(ctx, func(log sandbox.ExecLog) error {
		codeLogs++
		return nil
	})
	codeResult, err := codeOutput.Result(ctx)
	if err != nil || codeLogs == 0 || codeResult.ExitCode != 0 || !strings.Contains(codeResult.Stdout, "code-1") {
		failed = true
		fmt.Println("FAIL  streaming runCode", codeLogs, codeResult, err)
	} else {
		fmt.Println("PASS  streaming runCode")
	}

	fmt.Println("\n5) File upload + streamed download")
	if err := handle.PutFile(ctx, "tmp/live-go-stream.txt", strings.NewReader("local-go-stream-ok"), int64(len("local-go-stream-ok"))); err != nil {
		panic(err)
	}
	reader, err := handle.GetFile(ctx, "tmp/live-go-stream.txt")
	if err != nil {
		panic(err)
	}
	fileBytes, _ := io.ReadAll(reader)
	_ = reader.Close()
	if !strings.Contains(string(fileBytes), "local-go-stream-ok") {
		failed = true
		fmt.Println("FAIL  file stream download", string(fileBytes))
	} else {
		fmt.Println("PASS  file stream download")
	}

	if failed {
		os.Exit(1)
	}

	fmt.Println("\nAll Go live streaming checks passed.")
}
