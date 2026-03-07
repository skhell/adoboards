## Security

- API keys and PAT tokens **never appear in logs, console output, error messages, or source code**
- Keys are retrieved from KeePass, used immediately, and go out of scope never stored in memory longer than needed
- No keys are ever passed as URL parameters headers only
- The `.adoboards/` folder and `.env` are gitignored by default
- KeePass databases are AES-256 encrypted even root can't read them without the master password