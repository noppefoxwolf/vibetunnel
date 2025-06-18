import Testing
import Foundation
import HTTPTypes
import Hummingbird
import HummingbirdCore
import NIOCore
@testable import VibeTunnel

// MARK: - Mock Request Context

struct MockRequestContext: RequestContext {
    var coreContext: CoreRequestContext
    
    init(allocator: ByteBufferAllocator = ByteBufferAllocator(), logger: Logger = Logger(label: "test")) {
        self.coreContext = CoreRequestContext(allocator: allocator, logger: logger)
    }
}

// MARK: - Test Helpers

extension String {
    /// Encode string as Base64 for Basic Auth
    var base64Encoded: String {
        Data(self.utf8).base64EncodedString()
    }
}

// MARK: - Basic Auth Middleware Tests

@Suite("Basic Auth Middleware Tests", .tags(.security, .networking))
struct BasicAuthMiddlewareTests {
    
    // Helper to create a test request
    func createRequest(
        path: String = "/",
        method: HTTPRequest.Method = .get,
        headers: HTTPFields = HTTPFields()
    ) -> Request {
        Request(
            head: HTTPRequest(
                method: method,
                scheme: "http",
                authority: "localhost",
                path: path,
                headerFields: headers
            ),
            body: RequestBody(byteBuffer: ByteBuffer())
        )
    }
    
    // Helper to create a mock next handler
    func createNextHandler() -> (Request, MockRequestContext) async throws -> Response {
        return { request, context in
            Response(status: .ok)
        }
    }
    
    // MARK: - Valid Authentication Tests
    
    @Test("Valid authentication", arguments: zip(
        ["user:pass", "admin:secret", "test:password123"],
        ["pass", "secret", "password123"]
    ))
    func testValidAuth(credentials: String, expectedPassword: String) async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: expectedPassword)
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \(credentials.base64Encoded)"
        
        let request = createRequest(headers: headers)
        let context = MockRequestContext()
        
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .ok)
    }
    
    @Test("Valid auth with special characters", arguments: [
        "user:p@ssw0rd!",
        "admin:test-password-123",
        "test:password with spaces",
        "user:пароль", // Cyrillic
        "admin:パスワード", // Japanese
        "test:🔐secure🔐" // Emoji
    ])
    func testValidAuthSpecialChars(credentials: String) async throws {
        let parts = credentials.split(separator: ":", maxSplits: 1)
        let password = String(parts[1])
        
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: password)
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \(credentials.base64Encoded)"
        
        let request = createRequest(headers: headers)
        let context = MockRequestContext()
        
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .ok)
    }
    
    // MARK: - Invalid Authentication Tests
    
    @Test("Invalid authentication attempts")
    func testInvalidAuth() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "correct-password")
        let context = MockRequestContext()
        
        // Wrong password
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("user:wrong-password".base64Encoded)"
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .unauthorized)
        #expect(response.headers[.wwwAuthenticate]?.contains("Basic realm=") == true)
    }
    
    @Test("Missing authorization header")
    func testMissingAuthHeader() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        let request = createRequest() // No auth header
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .unauthorized)
        #expect(response.headers[.wwwAuthenticate] == "Basic realm=\"VibeTunnel Dashboard\"")
    }
    
    @Test("Invalid authorization header format", arguments: [
        "Bearer token123", // Wrong auth type
        "Basic", // Missing credentials
        "Basic ", // Empty credentials
        "InvalidHeader", // Completely wrong format
        "basic dXNlcjpwYXNz" // Lowercase 'basic'
    ])
    func testInvalidAuthHeaderFormat(authHeader: String) async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = authHeader
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .unauthorized)
    }
    
    @Test("Invalid base64 encoding")
    func testInvalidBase64() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic !!!invalid-base64!!!"
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .unauthorized)
    }
    
    @Test("Missing colon in credentials")
    func testMissingColon() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("userpassword".base64Encoded)" // No colon separator
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .unauthorized)
    }
    
    // MARK: - Health Check Bypass Tests
    
    @Test("Health check endpoint bypasses auth")
    func testHealthCheckBypass() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        // Request to health endpoint without auth
        let request = createRequest(path: "/api/health")
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .ok) // Should pass without auth
    }
    
    @Test("Other endpoints require auth", arguments: [
        "/",
        "/api/sessions",
        "/api/cleanup",
        "/dashboard",
        "/api/health/detailed" // Similar but different path
    ])
    func testOtherEndpointsRequireAuth(path: String) async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        // Request without auth
        let request = createRequest(path: path)
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .unauthorized)
    }
    
    // MARK: - Custom Realm Tests
    
    @Test("Custom realm configuration")
    func testCustomRealm() async throws {
        let customRealm = "My Custom Realm"
        let middleware = BasicAuthMiddleware<MockRequestContext>(
            password: "password",
            realm: customRealm
        )
        let context = MockRequestContext()
        
        let request = createRequest() // No auth
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .unauthorized)
        #expect(response.headers[.wwwAuthenticate] == "Basic realm=\"\(customRealm)\"")
    }
    
    // MARK: - Rate Limiting Tests
    
    @Test("Rate limiting", .tags(.security))
    func testRateLimiting() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "correct-password")
        let context = MockRequestContext()
        
        // Multiple failed attempts
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("user:wrong".base64Encoded)"
        
        // Make multiple requests
        for _ in 0..<5 {
            let response = try await middleware.handle(
                createRequest(headers: headers),
                context: context,
                next: createNextHandler()
            )
            #expect(response.status == .unauthorized)
        }
        
        // Note: Current implementation doesn't have rate limiting
        // This test documents expected behavior for future implementation
    }
    
    // MARK: - Username Handling Tests
    
    @Test("Username is ignored", arguments: [
        "admin:password",
        "user:password",
        "any-username:password",
        ":password" // Empty username
    ])
    func testUsernameIgnored(credentials: String) async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \(credentials.base64Encoded)"
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .ok)
    }
    
    // MARK: - Response Body Tests
    
    @Test("Unauthorized response includes message")
    func testUnauthorizedResponseBody() async throws {
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "password")
        let context = MockRequestContext()
        
        let request = createRequest() // No auth
        let response = try await middleware.handle(request, context: context, next: createNextHandler())
        
        #expect(response.status == .unauthorized)
        
        // Check response body
        if case .byteBuffer(let buffer) = response.body {
            let message = String(buffer: buffer)
            #expect(message == "Authentication required")
        } else {
            Issue.record("Expected byte buffer response body")
        }
    }
    
    // MARK: - Security Edge Cases
    
    @Test("Empty password handling")
    func testEmptyPassword() async throws {
        // Middleware with empty password (should probably be prevented in real usage)
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: "")
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("user:".base64Encoded)" // Empty password in request
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .ok) // Matches empty password
    }
    
    @Test("Very long credentials")
    func testVeryLongCredentials() async throws {
        let longPassword = String(repeating: "a", count: 1000)
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: longPassword)
        let context = MockRequestContext()
        
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("user:\(longPassword)".base64Encoded)"
        
        let response = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        
        #expect(response.status == .ok)
    }
    
    // MARK: - Integration Tests
    
    @Test("Full authentication flow", .tags(.integration))
    func testFullAuthFlow() async throws {
        let password = "secure-dashboard-password"
        let middleware = BasicAuthMiddleware<MockRequestContext>(password: password)
        let context = MockRequestContext()
        
        // 1. No auth - should fail
        let noAuthResponse = try await middleware.handle(
            createRequest(),
            context: context,
            next: createNextHandler()
        )
        #expect(noAuthResponse.status == .unauthorized)
        
        // 2. Wrong password - should fail
        var headers = HTTPFields()
        headers[.authorization] = "Basic \("admin:wrong".base64Encoded)"
        
        let wrongAuthResponse = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        #expect(wrongAuthResponse.status == .unauthorized)
        
        // 3. Correct password - should succeed
        headers[.authorization] = "Basic \("admin:\(password)".base64Encoded)"
        
        let correctAuthResponse = try await middleware.handle(
            createRequest(headers: headers),
            context: context,
            next: createNextHandler()
        )
        #expect(correctAuthResponse.status == .ok)
        
        // 4. Health check - should succeed without auth
        let healthResponse = try await middleware.handle(
            createRequest(path: "/api/health"),
            context: context,
            next: createNextHandler()
        )
        #expect(healthResponse.status == .ok)
    }
}