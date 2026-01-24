# HTML Artifact Templates

> **Copy-paste ready templates for common artifact types**

HTML is the **primary format** for Shipyard deliverables. These templates provide working examples agents can use directly.

## Why HTML for Artifacts?

- **Self-contained** - Inline CSS, no external dependencies
- **Rich formatting** - Syntax highlighting, colors, structure
- **Base64 images** - Embed screenshots directly in the HTML
- **Universal** - Works everywhere, no special viewers needed
- **Searchable** - Text content is indexable and grep-able

## Template 1: Test Results (Dark Theme)

Use this for unit tests, integration tests, coverage reports - anything with pass/fail output.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Results</title>
  <style>
    /* Dark terminal theme mimicking VS Code */
    body {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #1e1e1e;
      color: #d4d4d4;
      line-height: 1.6;
    }
    h1 {
      color: #22c55e;
      border-bottom: 2px solid #22c55e;
      padding-bottom: 10px;
      font-size: 1.5em;
      margin-bottom: 8px;
    }
    .file-path {
      color: #6b7280;
      font-size: 0.9em;
      margin-bottom: 24px;
    }
    .test-suite {
      background: #2d2d2d;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
      border-left: 4px solid #3b82f6;
    }
    .suite-name {
      font-weight: bold;
      color: #60a5fa;
      margin-bottom: 12px;
    }
    .test-case {
      margin: 8px 0;
      padding-left: 20px;
    }
    .pass {
      color: #22c55e;
    }
    .pass::before {
      content: "✔ ";
      font-weight: bold;
    }
    .fail {
      color: #ef4444;
    }
    .fail::before {
      content: "✖ ";
      font-weight: bold;
    }
    .skip {
      color: #f59e0b;
    }
    .skip::before {
      content: "○ ";
    }
    .time {
      color: #6b7280;
      font-size: 0.9em;
      margin-left: 8px;
    }
    .error-details {
      background: #3f1f1f;
      border-left: 4px solid #ef4444;
      padding: 12px;
      margin-top: 8px;
      font-size: 0.9em;
      color: #fca5a5;
    }
    .summary {
      background: #22c55e20;
      border: 1px solid #22c55e;
      padding: 16px;
      border-radius: 8px;
      margin-top: 24px;
    }
    .summary.fail {
      background: #ef444420;
      border-color: #ef4444;
    }
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .stat {
      display: flex;
      justify-content: space-between;
    }
    .stat-label {
      color: #9ca3af;
    }
    .stat-value {
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>Unit Test Results - PASS ✔</h1>
  <p class="file-path">src/utils/validation.test.ts</p>

  <div class="test-suite">
    <div class="suite-name">▶ Email Validation</div>
    <div class="test-case">
      <span class="pass">accepts valid email addresses</span>
      <span class="time">(0.83ms)</span>
    </div>
    <div class="test-case">
      <span class="pass">rejects invalid formats</span>
      <span class="time">(0.41ms)</span>
    </div>
    <div class="test-case">
      <span class="pass">handles edge cases (empty, null)</span>
      <span class="time">(0.29ms)</span>
    </div>
  </div>

  <div class="test-suite">
    <div class="suite-name">▶ Password Strength</div>
    <div class="test-case">
      <span class="pass">requires minimum length</span>
      <span class="time">(0.52ms)</span>
    </div>
    <div class="test-case">
      <span class="pass">enforces complexity rules</span>
      <span class="time">(0.67ms)</span>
    </div>
    <div class="test-case">
      <span class="pass">rejects common passwords</span>
      <span class="time">(1.23ms)</span>
    </div>
  </div>

  <div class="test-suite">
    <div class="suite-name">▶ Form Validation</div>
    <div class="test-case">
      <span class="pass">validates required fields</span>
      <span class="time">(0.38ms)</span>
    </div>
  </div>

  <div class="summary">
    <div style="font-size: 1.1em; font-weight: bold; color: #22c55e;">All Tests Passed</div>
    <div class="summary-stats">
      <div class="stat">
        <span class="stat-label">Tests:</span>
        <span class="stat-value">7 passed, 7 total</span>
      </div>
      <div class="stat">
        <span class="stat-label">Duration:</span>
        <span class="stat-value">141ms</span>
      </div>
      <div class="stat">
        <span class="stat-label">Coverage:</span>
        <span class="stat-value">92.3%</span>
      </div>
    </div>
  </div>
</body>
</html>
```

**When to use:** Unit tests, integration tests, coverage reports, linting results, type checking output.

**How to generate:**

```typescript
const html = `<!DOCTYPE html>...`; // Your template with dynamic content

await addArtifact({
  planId,
  sessionToken,
  type: 'test_results',
  filename: 'test-results.html',
  source: 'base64',
  content: Buffer.from(html).toString('base64'),
  deliverableId: deliverables[0].id,
  description: 'Unit test results showing 7/7 passing'
});
```

## Template 2: Adversarial Code Review (Light Theme)

Use this for code review results, security audits, quality assessments.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Review - Authentication Module</title>
  <style>
    /* Professional light theme for formal reviews */
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #ffffff;
      color: #1f2937;
      line-height: 1.6;
    }
    h1 {
      color: #111827;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 12px;
      margin-bottom: 8px;
    }
    h2 {
      color: #374151;
      margin-top: 32px;
      margin-bottom: 16px;
      font-size: 1.3em;
    }
    h3 {
      color: #4b5563;
      margin-top: 24px;
      margin-bottom: 12px;
      font-size: 1.1em;
    }
    .metadata {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      font-size: 0.9em;
    }
    .metadata-item {
      display: flex;
      flex-direction: column;
    }
    .metadata-label {
      font-weight: 600;
      color: #6b7280;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metadata-value {
      color: #111827;
      margin-top: 4px;
    }
    .verdict {
      padding: 20px;
      border-radius: 8px;
      margin: 24px 0;
      font-size: 1.1em;
      font-weight: 600;
    }
    .verdict.pass {
      background: #d1fae5;
      border: 2px solid #10b981;
      color: #065f46;
    }
    .verdict.conditional {
      background: #fef3c7;
      border: 2px solid #f59e0b;
      color: #92400e;
    }
    .verdict.fail {
      background: #fee2e2;
      border: 2px solid #ef4444;
      color: #991b1b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 0.9em;
    }
    th {
      background: #f9fafb;
      text-align: left;
      padding: 12px;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .risk-critical {
      color: #dc2626;
      font-weight: 600;
    }
    .risk-high {
      color: #ea580c;
      font-weight: 600;
    }
    .risk-medium {
      color: #d97706;
    }
    .risk-low {
      color: #65a30d;
    }
    .issue {
      background: #f9fafb;
      border-left: 4px solid #6b7280;
      padding: 16px;
      margin: 16px 0;
      border-radius: 4px;
    }
    .issue.critical {
      border-left-color: #dc2626;
      background: #fef2f2;
    }
    .issue.high {
      border-left-color: #ea580c;
      background: #fff7ed;
    }
    .issue.medium {
      border-left-color: #d97706;
      background: #fffbeb;
    }
    .issue-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: #111827;
    }
    .issue-location {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.85em;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .issue-description {
      margin-bottom: 12px;
      color: #374151;
    }
    .issue-recommendation {
      background: #ffffff;
      padding: 12px;
      border-radius: 4px;
      margin-top: 8px;
      font-size: 0.9em;
    }
    .recommendation-label {
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 4px;
    }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.9em;
      color: #dc2626;
    }
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
      margin: 24px 0;
    }
    .stat-card {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-number {
      font-size: 2em;
      font-weight: bold;
      color: #111827;
    }
    .stat-label {
      font-size: 0.85em;
      color: #6b7280;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <h1>Adversarial Code Review: Authentication Module</h1>

  <div class="metadata">
    <div class="metadata-item">
      <span class="metadata-label">Reviewer</span>
      <span class="metadata-value">Claude (Adversarial Mode)</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Date</span>
      <span class="metadata-value">2026-01-23</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Files Reviewed</span>
      <span class="metadata-value">7 files, 843 lines</span>
    </div>
    <div class="metadata-item">
      <span class="metadata-label">Review Time</span>
      <span class="metadata-value">23 minutes</span>
    </div>
  </div>

  <div class="verdict conditional">
    ⚠️ CONDITIONAL PASS - Address 3 critical issues before deployment
  </div>

  <h2>Executive Summary</h2>
  <p>
    The authentication module implements standard JWT-based auth with bcrypt password hashing.
    While the core implementation is sound, several security vulnerabilities and edge cases
    must be addressed before production deployment.
  </p>

  <div class="summary-stats">
    <div class="stat-card">
      <div class="stat-number">3</div>
      <div class="stat-label">Critical</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">5</div>
      <div class="stat-label">High</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">8</div>
      <div class="stat-label">Medium</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">12</div>
      <div class="stat-label">Low</div>
    </div>
  </div>

  <h2>Critical Issues (Must Fix)</h2>

  <div class="issue critical">
    <div class="issue-title">🔴 CRITICAL: JWT Secret Hardcoded in Source</div>
    <div class="issue-location">src/auth/jwt.ts:12</div>
    <div class="issue-description">
      The JWT signing secret is hardcoded as <code>const SECRET = "my-secret-key"</code>.
      This is a critical security vulnerability that allows anyone with access to the source
      code to forge authentication tokens.
    </div>
    <div class="issue-recommendation">
      <div class="recommendation-label">Recommendation:</div>
      Move secret to environment variable: <code>process.env.JWT_SECRET</code>. Generate a
      cryptographically secure random key (minimum 32 bytes). Rotate immediately if code
      has been committed to version control.
    </div>
  </div>

  <div class="issue critical">
    <div class="issue-title">🔴 CRITICAL: No Rate Limiting on Login Endpoint</div>
    <div class="issue-location">src/routes/auth.ts:45</div>
    <div class="issue-description">
      The <code>POST /login</code> endpoint has no rate limiting, allowing unlimited login
      attempts. This enables brute force attacks against user passwords.
    </div>
    <div class="issue-recommendation">
      <div class="recommendation-label">Recommendation:</div>
      Implement rate limiting using express-rate-limit (5 attempts per 15 minutes per IP).
      Add account lockout after 10 failed attempts. Consider using redis for distributed
      rate limiting in production.
    </div>
  </div>

  <div class="issue critical">
    <div class="issue-title">🔴 CRITICAL: Timing Attack in Password Comparison</div>
    <div class="issue-location">src/auth/password.ts:28</div>
    <div class="issue-description">
      Early return on username mismatch reveals whether username exists through timing
      differences. This allows enumeration of valid usernames.
    </div>
    <div class="issue-recommendation">
      <div class="recommendation-label">Recommendation:</div>
      Always call <code>bcrypt.compare()</code> even for invalid usernames to ensure
      constant-time comparison. Use dummy hash value for non-existent users.
    </div>
  </div>

  <h2>High Priority Issues</h2>

  <div class="issue high">
    <div class="issue-title">🟠 HIGH: Insufficient Password Requirements</div>
    <div class="issue-location">src/validation/password.ts:8</div>
    <div class="issue-description">
      Password validation only requires 6 characters with no complexity requirements.
      This is below NIST guidelines and susceptible to dictionary attacks.
    </div>
    <div class="issue-recommendation">
      <div class="recommendation-label">Recommendation:</div>
      Increase minimum to 12 characters. Check against common password lists using
      have-i-been-pwned API. Consider adding optional complexity requirements.
    </div>
  </div>

  <div class="issue high">
    <div class="issue-title">🟠 HIGH: JWT Tokens Never Expire</div>
    <div class="issue-location">src/auth/jwt.ts:18</div>
    <div class="issue-description">
      Tokens are issued without expiration time, meaning stolen tokens remain valid forever.
      No refresh token mechanism exists.
    </div>
    <div class="issue-recommendation">
      <div class="recommendation-label">Recommendation:</div>
      Add <code>expiresIn: '15m'</code> to JWT options. Implement refresh token flow with
      longer expiration. Store refresh tokens in httpOnly cookies.
    </div>
  </div>

  <h2>Risk Analysis</h2>

  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Risk Level</th>
        <th>Impact</th>
        <th>Likelihood</th>
        <th>Priority</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Credential Security</td>
        <td><span class="risk-critical">Critical</span></td>
        <td>Account Takeover</td>
        <td>High</td>
        <td>1</td>
      </tr>
      <tr>
        <td>Brute Force</td>
        <td><span class="risk-critical">Critical</span></td>
        <td>Unauthorized Access</td>
        <td>Very High</td>
        <td>1</td>
      </tr>
      <tr>
        <td>Token Management</td>
        <td><span class="risk-high">High</span></td>
        <td>Session Hijacking</td>
        <td>Medium</td>
        <td>2</td>
      </tr>
      <tr>
        <td>Password Strength</td>
        <td><span class="risk-high">High</span></td>
        <td>Credential Compromise</td>
        <td>High</td>
        <td>2</td>
      </tr>
      <tr>
        <td>Error Handling</td>
        <td><span class="risk-medium">Medium</span></td>
        <td>Information Disclosure</td>
        <td>Low</td>
        <td>3</td>
      </tr>
    </tbody>
  </table>

  <h2>Final Verdict</h2>

  <p>
    <strong>Status:</strong> CONDITIONAL PASS with required fixes
  </p>

  <p>
    The authentication implementation demonstrates understanding of modern auth patterns
    but contains critical security vulnerabilities that must be addressed before production
    deployment. The three critical issues (hardcoded secret, no rate limiting, timing attack)
    represent immediate security risks.
  </p>

  <p>
    <strong>Required Actions:</strong>
  </p>
  <ul>
    <li>Fix all 3 critical issues within 24 hours</li>
    <li>Address high-priority issues before production deployment</li>
    <li>Add integration tests for auth flows</li>
    <li>Security audit after fixes are implemented</li>
  </ul>

  <p>
    <strong>Approval Conditions:</strong> Re-review required after critical fixes are implemented.
  </p>
</body>
</html>
```

**When to use:** Code reviews, security audits, quality assessments, architectural reviews, PR feedback.

## Template 3: Terminal Output (Build/Deploy Logs)

Use this for build logs, deployment output, CLI command results.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Build Log</title>
  <style>
    body {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      max-width: 1200px;
      margin: 0;
      padding: 20px;
      background: #0d1117;
      color: #c9d1d9;
      line-height: 1.4;
    }
    h1 {
      color: #58a6ff;
      border-bottom: 2px solid #30363d;
      padding-bottom: 10px;
      font-size: 1.3em;
    }
    .command {
      background: #161b22;
      border: 1px solid #30363d;
      padding: 12px;
      border-radius: 6px;
      margin: 16px 0;
      color: #79c0ff;
    }
    .command::before {
      content: "$ ";
      color: #7ee787;
    }
    .log-line {
      margin: 4px 0;
      padding-left: 4px;
    }
    .info { color: #79c0ff; }
    .success { color: #7ee787; }
    .warning { color: #ffa657; }
    .error { color: #f85149; }
    .muted { color: #8b949e; }
    .timestamp {
      color: #6e7681;
      margin-right: 8px;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>Production Build Log</h1>
  <div class="command">pnpm build</div>

  <div class="log-line muted">
    <span class="timestamp">[21:45:12]</span>
    Starting build process...
  </div>
  <div class="log-line info">
    <span class="timestamp">[21:45:12]</span>
    Cleaning dist/ directory
  </div>
  <div class="log-line success">
    <span class="timestamp">[21:45:13]</span>
    ✓ TypeScript compilation successful
  </div>
  <div class="log-line success">
    <span class="timestamp">[21:45:15]</span>
    ✓ Bundle size: 142kb (gzipped: 48kb)
  </div>
  <div class="log-line success">
    <span class="timestamp">[21:45:15]</span>
    ✓ Build completed in 3.2s
  </div>
</body>
</html>
```

## Embedding Screenshots (Base64)

To include screenshots directly in HTML artifacts:

```typescript
import { readFileSync } from 'node:fs';

// Read screenshot file
const imageBuffer = readFileSync('/tmp/screenshot.png');
const base64Image = imageBuffer.toString('base64');

// Generate HTML with embedded image
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feature Demo</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #ffffff;
    }
    h1 {
      color: #111827;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 10px;
    }
    .screenshot {
      margin: 20px 0;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .screenshot img {
      width: 100%;
      height: auto;
      display: block;
    }
    .caption {
      background: #f9fafb;
      padding: 12px;
      color: #6b7280;
      font-size: 0.9em;
      border-top: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <h1>Login Page Implementation</h1>

  <div class="screenshot">
    <img src="data:image/png;base64,${base64Image}" alt="Login page with validation">
    <div class="caption">
      Login form showing email validation error state with red border and error message
    </div>
  </div>

  <h2>Features Implemented</h2>
  <ul>
    <li>Email validation with real-time feedback</li>
    <li>Password strength indicator</li>
    <li>Remember me checkbox</li>
    <li>Forgot password link</li>
  </ul>
</body>
</html>
`;

// Upload as artifact
await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'login-page-demo.html',
  source: 'base64',
  content: Buffer.from(html).toString('base64'),
  deliverableId: deliverables[0].id,
  description: 'Login page implementation with embedded screenshot'
});
```

## Best Practices

### Self-Contained HTML

**DO:**
- Inline all CSS in `<style>` tags
- Embed images as base64 data URIs
- Use web-safe fonts with fallbacks
- Include `<meta charset="UTF-8">` for proper encoding
- Add `<meta name="viewport">` for mobile rendering

**DON'T:**
- Link external stylesheets or scripts
- Use remote images or fonts
- Rely on CDNs or external resources
- Use JavaScript that requires network access

### Accessibility

```html
<!-- Good: Semantic HTML with proper alt text -->
<img src="data:image/png;base64,..." alt="Dashboard showing 3 pending tasks">

<!-- Good: Proper heading hierarchy -->
<h1>Test Results</h1>
<h2>Unit Tests</h2>
<h3>Authentication Module</h3>

<!-- Good: ARIA labels for dynamic content -->
<div role="status" aria-live="polite">
  Build completed successfully
</div>
```

### Performance

- Keep HTML under 5MB for fast loading
- Compress images before base64 encoding
- Use JPEG for photos, PNG for screenshots with text
- Consider linking large images instead of embedding

### Generating HTML with execute_code

```typescript
// Recommended: Use template literals for HTML generation
const testResults = [
  { name: 'should validate email', status: 'pass', time: 0.83 },
  { name: 'should reject invalid', status: 'pass', time: 0.41 }
];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Results</title>
  <style>/* Your styles */</style>
</head>
<body>
  <h1>Test Results</h1>
  ${testResults.map(test => `
    <div class="test-case">
      <span class="${test.status}">${test.name}</span>
      <span class="time">(${test.time}ms)</span>
    </div>
  `).join('\n')}
</body>
</html>`;

await addArtifact({
  planId,
  sessionToken,
  type: 'test_results',
  filename: 'test-results.html',
  source: 'base64',
  content: Buffer.from(html).toString('base64'),
  deliverableId: deliverables[0].id
});
```

## When NOT to Use HTML

HTML is not suitable for:
- **Large binary data** - Use direct file upload for videos, databases, archives
- **Interactive demos** - HTML is static; use actual screenshots or videos
- **Source code files** - Use `diff` type for code changes
- **Structured data** - Use JSON for API responses or data exports

For these cases, upload the native file format directly.
