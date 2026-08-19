# DeepSec Security Report

Findings: **1**
critical: 1 | high: 0 | medium: 0 | low: 0 | info: 0

## [CRITICAL] Google API key appears to be hardcoded.

- Location: `C:\Users\reso9\Desktop\yabuy-mvp\src\firebase.js:9`
- Rule: `hardcoded_secret_google_api_key`
- Layer: `L1`

Google API key appears to be hardcoded.

```text
AIza...6MyY
```

Remediation: Move the value to a secret manager and rotate it.
