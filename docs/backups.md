# StudentHub production backups

Backups are exported by `.github/workflows/backup.yml` and uploaded to the private EU R2 bucket `studenthub-backups`. Each archive contains Supabase database roles, schema, data, Storage objects, and SHA-256 manifests. The archive is encrypted with an age public recipient before upload. No database dump or Storage file is committed to GitHub or uploaded as an Actions artifact.

This is a logical export, not point-in-time recovery. Database and Storage are copied sequentially, so a file changed during the run may not represent exactly the same instant as its database row. Supabase's database backup alone does not include Storage object bytes.

## GitHub configuration

In repository Settings > Secrets and variables > Actions, configure:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `R2_ACCESS_KEY_ID` | R2 bucket-scoped Access Key ID |
| Secret | `R2_SECRET_ACCESS_KEY` | Matching R2 Secret Access Key |
| Secret | `SUPABASE_DB_URL` | Supabase Connect > Session pooler URI, including database password |
| Secret | `SUPABASE_BACKUP_SECRET_KEY` | Dedicated Supabase secret API key for this backup job (`sb_secret_...`) |
| Variable | `R2_BUCKET` | `studenthub-backups` |
| Variable | `R2_ENDPOINT` | `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` |
| Variable | `SUPABASE_URL` | `https://<PROJECT_REF>.supabase.co` |
| Variable | `BACKUP_AGE_RECIPIENT` | Public `age1...` recipient only |
| Variable | `BACKUP_ENABLED` | Leave unset until the first backup and restore check pass; then set `true` |

Use the Session pooler on port 5432, not transaction mode on port 6543. The script rejects a connection targeting a different Supabase project. Create a dedicated secret API key in Supabase Settings > API Keys so it can be rotated independently from the application key. Never paste secrets into chat, issues, commits, screenshots, or plain repository variables. Keep the R2 bucket's public access disabled.

Generate a separate age identity **outside the repository**. On Windows, install age with `winget install --id FiloSottile.age`, open a new terminal, then run:

```powershell
age-keygen -o "$env:USERPROFILE\studenthub-backup-identity.txt"
age-keygen -y "$env:USERPROFILE\studenthub-backup-identity.txt"
```

The second command prints the public recipient for `BACKUP_AGE_RECIPIENT`. Store the identity file securely in at least two controlled locations, such as an encrypted password manager and an offline copy. **Do not put the private identity into GitHub.** Without it, the encrypted backups cannot be restored.

## First run and activation

1. Keep `BACKUP_ENABLED` unset.
2. Open GitHub Actions > Encrypted Supabase backup > Run workflow. This runs once even while the daily schedule is disabled.
3. Check that the run succeeded and that a `.tar.gz.age` object appears under `studenthub/daily/` in the private R2 bucket. A failed or partial export must not be considered a backup.
4. Download the encrypted object and decrypt it locally with the offline identity. Extract into a temporary, private directory and run `node scripts/backup/manifest.mjs verify <extracted-directory>`.
5. For a complete restore exercise, restore the SQL and Storage objects into a separate Supabase test project following Supabase's official restore guide. Never test restoration against production. Record the date and outcome.
6. Only after these checks set the repository variable `BACKUP_ENABLED=true`. The workflow then runs daily at 02:17 UTC.

The workflow keeps the newest seven daily snapshots and four Sunday snapshots. It prunes only archive names under its own `studenthub/daily/` and `studenthub/weekly/` prefixes, after a fresh upload has been downloaded and compared byte-for-byte. This is not immutable retention; review R2 usage and GitHub Actions run history regularly. GitHub Actions failure notifications should be enabled for the repository owner.

## Restore check on Windows

After downloading one encrypted archive, use a PowerShell session and a temporary destination that is not synchronized to GitHub or shared cloud folders:

```powershell
$archive = "C:\path\to\downloaded.tar.gz.age"
$check = Join-Path $env:TEMP "studenthub-restore-check"
New-Item -ItemType Directory -Force -Path $check | Out-Null
age -d -i "$env:USERPROFILE\studenthub-backup-identity.txt" -o (Join-Path $check "backup.tar.gz") $archive
tar -xzf (Join-Path $check "backup.tar.gz") -C $check
node scripts/backup/manifest.mjs verify $check
```

The decrypted directory contains personal data. Remove it securely after inspection. Checksum verification confirms archive integrity, but only a successful restore into an isolated Supabase project demonstrates full recoverability.

References: [Supabase backup guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Supabase Storage downloads](https://supabase.com/docs/guides/storage/management/download-objects), [Cloudflare EU R2 endpoint](https://developers.cloudflare.com/r2/api/tokens/), [age](https://github.com/FiloSottile/age).
