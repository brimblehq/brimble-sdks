package sandbox

import (
	"net/url"
	"strings"
)

func encodeFilePath(path string) string {
	segments := strings.Split(path, "/")
	encoded := make([]string, 0, len(segments))
	for _, segment := range segments {
		if segment == "" {
			continue
		}
		encoded = append(encoded, url.PathEscape(segment))
	}
	return strings.Join(encoded, "/")
}
