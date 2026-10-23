# API Layer & Security

<cite>
**Referenced Files in This Document**
- [api.server.ts](file://src/lib/security/api.server.ts)
- [origin.ts](file://src/lib/security/origin.ts)
- [rate-limit.server.ts](file://src/lib/security/rate-limit.server.ts)
- [route.ts (login)](file://src/app\api\login\route.ts)
- [route.ts (register)](file://src/app\api\register\route.ts)
- [route.ts (availability)](file://src/app\api\availability\route.ts)
- [route.ts (quiz)](file://src/app\api\quiz\route.ts)
- [route.ts (result)](file://src/app\api/result\route.ts)
- [route.ts (notifications)](file://src/app\api\notifications\route.ts)
- [route.ts (admin login)](file://src/app\api\admin\login\route.ts)
- [route.ts (admin logout)](file://src/app\api\admin\logout\route.ts)
- [route.ts (quiz-v2)](file://src/app\api\quiz-v2\route.ts)
- [route.ts (result-v2)](file://src/app\api\result-v2\route.ts)
- [identity.server.ts](file://src/lib/identity.server.ts)
- [validation.ts](file://src/lib/validation.ts)
- [validation-v2.ts](file://src/lib/validation-v2.ts)
- [env.server.ts](file://src/lib/env.server.ts)
- [admin-auth.server.ts](file://src/lib/admin-auth.server.ts)
- [microtest-v2.ts](file://src/types/microtest-v2.ts)
- [explainability.ts](file://src/lib/explainability.ts)
</cite>

## Update Summary
**Changes Made**
- Added documentation for new v2 API endpoints: `/api/quiz-v2` and `/api/result-v2`
- Updated architecture diagrams to include v2 endpoints
- Enhanced endpoint analysis with v2-specific validation, scoring, and explanation features
- Added comprehensive coverage of dual-track matching system (romance + friendship)
- Documented explainability engine integration for detailed match explanations

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion

## Introduction
This document explains the API layer and security model for the application. It covers how requests are validated, authenticated, rate-limited, and routed to backend services. The system now supports both legacy v1 endpoints and new v2 endpoints that provide enhanced multidimensional matching with detailed explanations. It also documents admin-only flows, data validation schemas, and environment configuration used by the API endpoints.

## Project Structure
The API is implemented as Next.js Route Handlers under src/app/api. Each endpoint:
- Validates input with Zod schemas
- Enforces CORS and origin allowlisting
- Applies per-endpoint rate limiting
- Authenticates users via Supabase session or service role where appropriate
- Persists or queries data through Supabase RPCs and tables

```mermaid
graph TB
subgraph "API Routes"
A["/api/login"]
B["/api/register"]
C["/api/availability"]
D["/api/quiz"]
E["/api/result"]
F["/api/notifications"]
G["/api/admin/login"]
H["/api/admin/logout"]
I["/api/quiz-v2"]
J["/api/result-v2"]
end
subgraph "Security Middleware"
S1["withApiSecurity<br/>CORS + Rate Limit"]
S2["Origin Policy"]
S3["Rate Limiter"]
end
subgraph "Backend"
DB["Supabase Auth / DB / RPC"]
end
A --> S1 --> DB
B --> S1 --> DB
C --> S1 --> DB
D --> S1 --> DB
E --> S1 --> DB
F --> S1 --> DB
G --> S1 --> DB
H --> S1 --> DB
I --> S1 --> DB
J --> S1 --> DB
S1 --> S2
S1 --> S3
```

**Diagram sources**
- [api.server.ts:68-100](file://src/lib/security/api.server.ts#L68-L100)
- [origin.ts:20-34](file://src/lib/security/origin.ts#L20-L34)
- [rate-limit.server.ts:76-116](file://src/lib/security/rate-limit.server.ts#L76-L116)

**Section sources**
- [api.server.ts:1-117](file://src/lib/security/api.server.ts#L1-L117)
- [origin.ts:1-46](file://src/lib/security/origin.ts#L1-L46)
- [rate-limit.server.ts:1-117](file://src/lib/security/rate-limit.server.ts#L1-L117)

## Core Components
- API security middleware: enforces allowed origins, CORS headers, and per-endpoint rate limits; returns standardized security headers.
- Origin policy: parses configured origins, allows same-origin and non-browser requests, and rejects disallowed origins.
- Rate limiter: fixed-window counter backed by Upstash Redis; fails open in development, fails closed in production when unavailable.
- Identity helpers: HMAC hashing of matricula and generation of private email addresses for internal auth flows.
- Validation schemas: strict Zod schemas for availability checks, registration, quiz submissions, and notification payloads including v2 dual-track validation.
- Environment loader: validates required server-side environment variables before use.

**Section sources**
- [api.server.ts:1-117](file://src/lib/security/api.server.ts#L1-L117)
- [origin.ts:1-46](file://src/lib/security/origin.ts#L1-L46)
- [rate-limit.server.ts:1-117](file://src/lib/security/rate-limit.server.ts#L1-L117)
- [identity.server.ts:1-10](file://src/lib/identity.server.ts#L1-L10)
- [validation.ts:1-63](file://src/lib/validation.ts#L1-L63)
- [validation-v2.ts:1-72](file://src/lib/validation-v2.ts#L1-L72)
- [env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

## Architecture Overview
All public endpoints are wrapped with withApiSecurity, which performs:
- Origin allowlist check
- Rate limit evaluation
- CORS header application
- Security headers injection (Cache-Control, X-Content-Type-Options)

Authenticated endpoints verify the current user via Supabase session. Admin endpoints additionally enforce a role check against a database table.

```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "Route Handler"
participant Sec as "withApiSecurity"
participant RL as "Rate Limiter"
participant Supa as "Supabase"
Client->>Sec : HTTP request
Sec->>Sec : Validate origin
Sec->>RL : Evaluate rate limit
RL-->>Sec : Decision (allow/limited/unavailable/bypass)
alt Allowed
Sec->>API : Invoke handler
API->>Supa : Auth / DB / RPC calls
Supa-->>API : Data or error
API-->>Client : JSON response
else Limited
Sec-->>Client : 429 Too Many Requests
else Unavailable
Sec-->>Client : 503 Service Unavailable
end
```

**Diagram sources**
- [api.server.ts:68-100](file://src/lib/security/api.server.ts#L68-L100)
- [rate-limit.server.ts:76-116](file://src/lib/security/rate-limit.server.ts#L76-L116)

## Detailed Component Analysis

### API Security Middleware
Responsibilities:
- Allow only same-origin or explicitly configured origins
- Apply CORS headers including credentials support
- Enforce per-endpoint rate limits using Upstash Redis
- Add security headers to all responses

Key behaviors:
- Preflight OPTIONS handling with caching
- Fail-open in development if rate limiter is unreachable
- Consistent Cache-Control: no-store on sensitive responses

```mermaid
flowchart TD
Start(["Request"]) --> CheckOrigin["Check origin allowlist"]
CheckOrigin --> |Denied| Deny["403 Forbidden"]
CheckOrigin --> |Allowed| RateLimit["Evaluate rate limit"]
RateLimit --> |Limited| TooMany["429 Too Many Requests"]
RateLimit --> |Unavailable| SvcUnavail["503 Service Unavailable"]
RateLimit --> |Allowed| CallHandler["Call route handler"]
CallHandler --> ApplyHeaders["Apply CORS + security headers"]
ApplyHeaders --> End(["Response"])
```

**Diagram sources**
- [api.server.ts:13-66](file://src/lib/security/api.server.ts#L13-L66)
- [api.server.ts:68-100](file://src/lib/security/api.server.ts#L68-L100)
- [api.server.ts:103-117](file://src/lib/security/api.server.ts#L103-L117)

**Section sources**
- [api.server.ts:1-117](file://src/lib/security/api.server.ts#L1-L117)

### Origin Policy
- Parses comma-separated origins from environment into normalized origins
- Allows same-origin and non-browser requests (no Origin header)
- Rejects malformed or disallowed origins

**Section sources**
- [origin.ts:1-46](file://src/lib/security/origin.ts#L1-L46)

### Rate Limiter
- Fixed-window algorithm using Redis INCR/EXPIRE via Upstash REST
- Produces decision objects with remaining quota and reset timestamps
- In development, bypasses limits on failure; in production, returns 503 when unavailable

**Section sources**
- [rate-limit.server.ts:1-117](file://src/lib/security/rate-limit.server.ts#L1-L117)

### Identity Helpers
- Hashes matricula with HMAC-SHA256 using a secret
- Generates private email addresses for internal authentication flows

**Section sources**
- [identity.server.ts:1-10](file://src/lib/identity.server.ts#L1-L10)

### Validation Schemas
- Availability: requires normalized matricula
- Registration: requires matricula and password with minimum length
- Quiz submission: requires exactly the expected set of item IDs with valid Likert values
- Body parser: safely parses JSON bodies
- V2 Quiz submission: validates dual-track questionnaire with likert answers and filter selections

**Section sources**
- [validation.ts:1-63](file://src/lib/validation.ts#L1-L63)
- [validation-v2.ts:1-72](file://src/lib/validation-v2.ts#L1-L72)

### Environment Configuration
- Requires Supabase URL, service role key, and HMAC secret
- Returns null if any required variable is missing or invalid

**Section sources**
- [env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

### Endpoint: User Login (/api/login)
Flow:
- Validate availability-style payload containing matricula
- Compute HMAC hash and derive private email
- Use service role client to generate a magic link token
- Verify OTP token via session client to establish SSR cookies
- Determine redirect based on v2 quiz completion status

Error handling:
- Invalid input -> 400
- Missing profile -> 404
- Service issues -> 503

```mermaid
sequenceDiagram
participant Client as "Client"
participant Login as "/api/login"
participant Env as "getServerEnv"
participant Admin as "Supabase Admin"
participant Session as "Supabase Session"
Client->>Login : POST {matricula}
Login->>Env : Load env
Login->>Admin : Generate magic link (private email)
Admin-->>Login : hashed_token
Login->>Session : verifyOtp(hashed_token)
Session-->>Login : success/error
Login->>Admin : Check profiles_v2.quiz_completed_at
Admin-->>Login : hasQuiz?
Login-->>Client : {ok, hasQuiz, redirect}
```

**Diagram sources**
- [route.ts (login):19-99](file://src/app\api\login\route.ts#L19-L99)

**Section sources**
- [route.ts (login):1-111](file://src/app\api\login\route.ts#L1-L111)

### Endpoint: Registration (/api/register)
Flow:
- Validate matricula and password
- Create user via service role client with auto confirmation
- Insert profile record
- Sign in via session client to set cookies
- Roll back user creation on profile insertion or sign-in failure

Error handling:
- Invalid input -> 400
- Conflict or service errors -> 409/503

**Section sources**
- [route.ts (register):1-74](file://src/app\api\register\route.ts#L1-L74)

### Endpoint: Availability Check (/api/availability)
Flow:
- Validate matricula
- Hash matricula and call RPC to check availability

Error handling:
- Invalid input -> 400
- Service issues -> 503

**Section sources**
- [route.ts (availability):1-47](file://src/app\api\availability\route.ts#L1-L47)

### Endpoint: Quiz Submission (/api/quiz)
Flow:
- Authenticate user via session
- Validate answers schema
- Score microtest locally
- Persist results and refresh matches via RPC

Error handling:
- Unauthorized -> 401
- Invalid input -> 400
- Service issues -> 503

**Section sources**
- [route.ts (quiz):1-72](file://src/app\api\quiz\route.ts#L1-L72)

### Endpoint: Results (/api/result)
Flow:
- Authenticate user via session
- Fetch profile and matches concurrently
- Validate matches array shape
- Return alias, archetype, and matches

Error handling:
- Unauthorized -> 401
- Service issues -> 503

**Section sources**
- [route.ts (result):1-71](file://src/app\api/result\route.ts#L1-L71)

### Endpoint: Notifications (/api/notifications)
GET:
- Authenticate user
- Optionally include read notifications via query param
- Validate returned notifications array

PATCH:
- Authenticate user
- Validate list of notification IDs
- Mark notifications read via RPC

Error handling:
- Unauthorized -> 401
- Invalid input -> 400
- Service issues -> 503

**Section sources**
- [route.ts (notifications):1-99](file://src/app\api\notifications\route.ts#L1-L99)

### Endpoint: Quiz Submission v2 (/api/quiz-v2)
**New** - Enhanced v2 endpoint supporting dual-track matching (romance + friendship)

Flow:
- Validate v2 quiz submission schema with likert answers and filter selections
- Authenticate user via session
- Score quiz using multidimensional matching algorithm
- Generate profile identity (animal, color, narrative)
- Detect first-time submission for welcome notification
- Submit results via RPC with flattened answer format
- Compute dual matches with romance and friendship thresholds
- Send match notifications and optional welcome message

Key features:
- Dual-track scoring with separate romance (26 dimensions) and friendship (16 dimensions) vectors
- Hard filters for romance track compatibility
- Profile identity generation with animal archetypes and colors
- Welcome notification for first-time submissions

Error handling:
- Unauthorized -> 401
- Invalid input -> 400
- Service issues -> 503

```mermaid
sequenceDiagram
participant Client as "Client"
participant QuizV2 as "/api/quiz-v2"
participant Session as "Supabase Session"
participant Admin as "Supabase Admin"
participant Scoring as "scoreQuizV2"
participant Notif as "Notifications"
Client->>QuizV2 : POST {likert, filters}
QuizV2->>QuizV2 : Validate v2 schema
QuizV2->>Session : getUser()
Session-->>QuizV2 : user_id
QuizV2->>Scoring : scoreQuizV2(answers)
Scoring-->>QuizV2 : scored profile
QuizV2->>Admin : submit_quiz_result_v2
Admin-->>QuizV2 : success
QuizV2->>Admin : compute_dual_matches
Admin-->>QuizV2 : success
QuizV2->>Admin : notify_matches_v2
Admin-->>QuizV2 : success
alt First submission
QuizV2->>Notif : Insert welcome notification
end
QuizV2-->>Client : {ok, profile}
```

**Diagram sources**
- [route.ts (quiz-v2):16-118](file://src/app\api\quiz-v2\route.ts#L16-L118)

**Section sources**
- [route.ts (quiz-v2):1-129](file://src/app\api\quiz-v2\route.ts#L1-L129)

### Endpoint: Results v2 (/api/result-v2)
**New** - Enhanced v2 endpoint providing detailed match explanations

Flow:
- Authenticate user via session
- Fetch user profile and matches concurrently
- Validate matches array structure
- Build detailed match entries with explanations
- Generate affective explanations using explainability engine
- Return comprehensive match data with badges and narratives

Key features:
- Detailed match explanations with chemistry summaries
- Affinity breakdowns by category (personality, cultural, intimacy, values, identity)
- Personality summaries with MBTI codes and Big Five traits
- Connection headlines with poetic descriptions
- Badge system showing top compatible dimensions
- Separate romance and friendship match arrays

Error handling:
- Unauthorized -> 401
- Quiz not completed -> 404
- Service issues -> 503

```mermaid
sequenceDiagram
participant Client as "Client"
participant ResultV2 as "/api/result-v2"
participant Session as "Supabase Session"
participant Admin as "Supabase Admin"
participant Explain as "Explainability Engine"
Client->>ResultV2 : GET
ResultV2->>Session : getUser()
Session-->>ResultV2 : user_id
ResultV2->>Admin : Get profile + matches
Admin-->>ResultV2 : profile_data, matches
ResultV2->>Explain : generateMatchExplanation()
Explain-->>ResultV2 : detailed_explanation
ResultV2-->>Client : {alias, matches, explanations}
```

**Diagram sources**
- [route.ts (result-v2):134-256](file://src/app\api\result-v2\route.ts#L134-L256)

**Section sources**
- [route.ts (result-v2):1-267](file://src/app\api\result-v2\route.ts#L1-L267)

### Admin Authentication
Admin login:
- Validates email/password
- Signs in via Supabase
- Checks user_roles table for admin role
- Wraps with rate limiting

Admin logout:
- Signs out via Supabase

Admin context helper:
- Verifies authenticated user and admin role
- Loads dashboard metrics via RPC

```mermaid
sequenceDiagram
participant Client as "Client"
participant AdminLogin as "/api/admin/login"
participant Supa as "Supabase"
participant Roles as "user_roles"
Client->>AdminLogin : POST {email, password}
AdminLogin->>Supa : signInWithPassword
Supa-->>AdminLogin : user or error
AdminLogin->>Roles : SELECT role WHERE user_id = ? AND role = 'admin'
Roles-->>AdminLogin : role or null
AdminLogin-->>Client : ok or 401
```

**Diagram sources**
- [route.ts (admin login):15-43](file://src/app\api\admin\login\route.ts#L15-L43)

**Section sources**
- [route.ts (admin login):1-55](file://src/app\api\admin\login\route.ts#L1-L55)
- [route.ts (admin logout):1-27](file://src/app\api\admin\logout\route.ts#L1-L27)
- [admin-auth.server.ts:1-37](file://src/lib/admin-auth.server.ts#L1-L37)

## Dependency Analysis
High-level dependencies between components:

```mermaid
graph LR
Routes["API Routes"] --> Sec["withApiSecurity"]
Sec --> Origin["Origin Policy"]
Sec --> RL["Rate Limiter"]
Routes --> Valid["Validation Schemas"]
Routes --> ValidV2["V2 Validation Schemas"]
Routes --> Id["Identity Helpers"]
Routes --> Env["Environment Loader"]
Routes --> Supa["Supabase (Auth/DB/RPC)"]
Routes --> Explain["Explainability Engine"]
```

**Diagram sources**
- [api.server.ts:68-100](file://src/lib/security/api.server.ts#L68-L100)
- [origin.ts:20-34](file://src/lib/security/origin.ts#L20-L34)
- [rate-limit.server.ts:76-116](file://src/lib/security/rate-limit.server.ts#L76-L116)
- [validation.ts:1-63](file://src/lib/validation.ts#L1-L63)
- [validation-v2.ts:1-72](file://src/lib/validation-v2.ts#L1-L72)
- [identity.server.ts:1-10](file://src/lib/identity.server.ts#L1-L10)
- [env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)
- [explainability.ts:1-836](file://src/lib/explainability.ts#L1-L836)

**Section sources**
- [api.server.ts:1-117](file://src/lib/security/api.server.ts#L1-L117)
- [origin.ts:1-46](file://src/lib/security/origin.ts#L1-L46)
- [rate-limit.server.ts:1-117](file://src/lib/security/rate-limit.server.ts#L1-L117)
- [validation.ts:1-63](file://src/lib/validation.ts#L1-L63)
- [validation-v2.ts:1-72](file://src/lib/validation-v2.ts#L1-L72)
- [identity.server.ts:1-10](file://src/lib/identity.server.ts#L1-L10)
- [env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)
- [explainability.ts:1-836](file://src/lib/explainability.ts#L1-L836)

## Performance Considerations
- All responses set Cache-Control: no-store to avoid caching sensitive data.
- Preflight responses cache metadata for 600 seconds to reduce repeated CORS overhead.
- Rate limiting uses a single Redis round-trip per request with a short timeout to minimize latency impact.
- Parallel data fetching is used where possible (e.g., concurrent profile and matches retrieval).
- V2 endpoints optimize vector operations for dual-track matching calculations.
- Explainability engine uses deterministic algorithms for consistent match explanations.

## Troubleshooting Guide
Common issues and resolutions:
- 403 Origin not allowed: Ensure the client's origin is either same-origin or included in CORS_ALLOWED_ORIGINS.
- 429 Too many requests: Respect Retry-After and X-RateLimit headers; adjust client retry strategy.
- 503 Service unavailable: Indicates missing environment variables, rate limiter outage, or Supabase connectivity issues.
- 401 Unauthorized: Verify Supabase session cookies are present and valid; re-login if necessary.
- 400 Invalid request: Check payload structure against the relevant Zod schema.
- V2 Quiz validation errors: Ensure all required likert and filter items are present with correct formats.
- V2 Result errors: Verify quiz completion status and match data integrity.

Operational tips:
- Inspect X-RateLimit-* headers to understand quota usage.
- Confirm that SUPABASE_SERVICE_ROLE_KEY and MATRICULA_HMAC_SECRET are correctly set for admin and identity operations.
- For admin flows, ensure the user has the admin role in user_roles.
- Monitor v2 endpoint performance separately due to complex matching calculations.

**Section sources**
- [api.server.ts:68-100](file://src/lib/security/api.server.ts#L68-L100)
- [rate-limit.server.ts:46-65](file://src/lib/security/rate-limit.server.ts#L46-L65)
- [env.server.ts:1-22](file://src/lib/env.server.ts#L1-L22)

## Conclusion
The API layer combines strict input validation, robust origin control, and per-endpoint rate limiting to provide a secure surface. Authentication is handled via Supabase sessions, with additional admin role enforcement. The system now supports both legacy v1 endpoints and enhanced v2 endpoints that provide sophisticated multidimensional matching with detailed explanations. The design favors fail-open behavior for rate limiting in development while maintaining strict controls in production. Proper environment configuration and consistent error handling ensure predictable behavior across environments. The v2 endpoints introduce advanced features like dual-track matching, personality explanations, and comprehensive match analytics.