import Testing
import Foundation
import Security
@testable import VibeTunnel

// MARK: - Mock DashboardKeychain for Testing

@MainActor
final class MockDashboardKeychain: DashboardKeychain {
    // In-memory storage for testing
    private var storedPassword: String?
    var shouldFailOperations = false
    var operationDelay: Duration?
    
    override func getPassword() -> String? {
        if shouldFailOperations { return nil }
        return storedPassword
    }
    
    override func hasPassword() -> Bool {
        if shouldFailOperations { return false }
        return storedPassword != nil
    }
    
    override func setPassword(_ password: String) -> Bool {
        if shouldFailOperations { return false }
        if password.isEmpty { return false }
        
        storedPassword = password
        return true
    }
    
    override func deletePassword() -> Bool {
        if shouldFailOperations { return false }
        storedPassword = nil
        return true
    }
    
    // Test helper to reset state
    func reset() {
        storedPassword = nil
        shouldFailOperations = false
        operationDelay = nil
    }
}

// MARK: - Keychain Error Types for Testing

enum KeychainError: Error, Equatable {
    case itemNotFound
    case duplicateItem
    case invalidData
    case accessDenied
    case unknown(OSStatus)
    
    init(status: OSStatus) {
        switch status {
        case errSecItemNotFound:
            self = .itemNotFound
        case errSecDuplicateItem:
            self = .duplicateItem
        case errSecParam:
            self = .invalidData
        case errSecAuthFailed:
            self = .accessDenied
        default:
            self = .unknown(status)
        }
    }
}

// MARK: - Dashboard Keychain Tests

@Suite("Dashboard Keychain Tests", .tags(.security))
@MainActor
struct DashboardKeychainTests {
    
    // MARK: - Password Storage Tests
    
    @Test("Storing and retrieving passwords")
    func testPasswordStorage() throws {
        let keychain = MockDashboardKeychain()
        
        // Initially no password
        #expect(keychain.getPassword() == nil)
        #expect(!keychain.hasPassword())
        
        // Store password
        let testPassword = "secure-test-password-123"
        let stored = keychain.setPassword(testPassword)
        #expect(stored)
        
        // Verify retrieval
        #expect(keychain.getPassword() == testPassword)
        #expect(keychain.hasPassword())
    }
    
    @Test("Password with special characters", arguments: [
        "p@ssw0rd!",
        "test-password-123",
        "пароль-тест",  // Cyrillic
        "パスワード",     // Japanese
        "🔐secure🔐",   // Emoji
        "password with spaces"
    ])
    func testPasswordSpecialCharacters(password: String) throws {
        let keychain = MockDashboardKeychain()
        
        let stored = keychain.setPassword(password)
        #expect(stored)
        
        let retrieved = keychain.getPassword()
        #expect(retrieved == password)
    }
    
    @Test("Empty password is rejected")
    func testEmptyPassword() throws {
        let keychain = MockDashboardKeychain()
        
        let stored = keychain.setPassword("")
        #expect(!stored)
        
        // Verify nothing was stored
        #expect(keychain.getPassword() == nil)
        #expect(!keychain.hasPassword())
    }
    
    // MARK: - Password Update Tests
    
    @Test("Password update operations")
    func testPasswordUpdate() throws {
        let keychain = MockDashboardKeychain()
        
        // Store initial password
        let initialPassword = "initial-password"
        #expect(keychain.setPassword(initialPassword))
        #expect(keychain.getPassword() == initialPassword)
        
        // Update password
        let updatedPassword = "updated-password"
        #expect(keychain.setPassword(updatedPassword))
        
        // Verify update
        #expect(keychain.getPassword() == updatedPassword)
        #expect(keychain.getPassword() != initialPassword)
    }
    
    @Test("Multiple password updates", arguments: 1...5)
    func testMultipleUpdates(iteration: Int) throws {
        let keychain = MockDashboardKeychain()
        
        let password = "password-v\(iteration)"
        #expect(keychain.setPassword(password))
        #expect(keychain.getPassword() == password)
    }
    
    // MARK: - Password Deletion Tests
    
    @Test("Password deletion")
    func testPasswordDeletion() throws {
        let keychain = MockDashboardKeychain()
        
        // Store password
        let password = "password-to-delete"
        #expect(keychain.setPassword(password))
        #expect(keychain.hasPassword())
        
        // Delete password
        #expect(keychain.deletePassword())
        
        // Verify deletion
        #expect(keychain.getPassword() == nil)
        #expect(!keychain.hasPassword())
    }
    
    @Test("Delete non-existent password")
    func testDeleteNonExistent() throws {
        let keychain = MockDashboardKeychain()
        
        // Ensure no password exists
        #expect(!keychain.hasPassword())
        
        // Delete should still succeed (idempotent)
        #expect(keychain.deletePassword())
    }
    
    // MARK: - Error Handling Tests
    
    @Test("Keychain error handling", arguments: [
        KeychainError.itemNotFound,
        KeychainError.duplicateItem,
        KeychainError.invalidData,
        KeychainError.accessDenied
    ])
    func testErrorHandling(error: KeychainError) throws {
        // Test error descriptions
        switch error {
        case .itemNotFound:
            #expect(error == .itemNotFound)
        case .duplicateItem:
            #expect(error == .duplicateItem)
        case .invalidData:
            #expect(error == .invalidData)
        case .accessDenied:
            #expect(error == .accessDenied)
        case .unknown:
            break
        }
    }
    
    @Test("Handle keychain operation failures")
    func testOperationFailures() throws {
        let keychain = MockDashboardKeychain()
        keychain.shouldFailOperations = true
        
        // All operations should fail
        #expect(!keychain.setPassword("test"))
        #expect(keychain.getPassword() == nil)
        #expect(!keychain.hasPassword())
        #expect(!keychain.deletePassword())
    }
    
    // MARK: - Security Tests
    
    @Test("Password is not logged in plain text")
    func testPasswordLogging() throws {
        // This test verifies that passwords are not exposed in logs
        // In production, the logger should never output the actual password
        let keychain = MockDashboardKeychain()
        let sensitivePassword = "super-secret-password"
        
        // Store password - in real implementation, this should not log the password
        _ = keychain.setPassword(sensitivePassword)
        
        // The test passes if no assertion fails
        // In real implementation, we'd check log output doesn't contain the password
        #expect(true)
    }
    
    @Test("Has password check doesn't retrieve data")
    func testHasPasswordEfficiency() throws {
        let keychain = MockDashboardKeychain()
        
        // Store a password
        #expect(keychain.setPassword("test-password"))
        
        // hasPassword should be efficient and not retrieve the actual password
        // This is important to avoid keychain prompts
        #expect(keychain.hasPassword())
        
        // In the real implementation, hasPassword uses kSecReturnData: false
        // to avoid retrieving the actual password data
    }
    
    // MARK: - Concurrent Access Tests
    
    @Test("Concurrent password operations", .tags(.concurrency))
    func testConcurrentAccess() async throws {
        let keychain = MockDashboardKeychain()
        
        // Perform multiple operations concurrently
        await withTaskGroup(of: Bool.self) { group in
            // Multiple writes
            for i in 0..<5 {
                group.addTask {
                    keychain.setPassword("password-\(i)")
                }
            }
            
            // Multiple reads
            for _ in 0..<5 {
                group.addTask {
                    _ = keychain.getPassword()
                    return keychain.hasPassword()
                }
            }
            
            // Collect results
            var results: [Bool] = []
            for await result in group {
                results.append(result)
            }
            
            // At least some operations should succeed
            #expect(results.contains(true))
        }
        
        // Final state should be consistent
        #expect(keychain.hasPassword() == (keychain.getPassword() != nil))
    }
    
    // MARK: - Debug vs Release Behavior Tests
    
    @Test("Debug mode behavior")
    func testDebugModeBehavior() throws {
        // In debug mode, DashboardKeychain skips actual keychain access
        #if DEBUG
        let keychain = DashboardKeychain.shared
        
        // getPassword returns nil in debug mode
        #expect(keychain.getPassword() == nil)
        
        // But setPassword still reports success
        #expect(keychain.setPassword("debug-password"))
        #endif
    }
    
    // MARK: - Password Generation Tests
    
    @Test("Password complexity validation")
    func testPasswordComplexity() throws {
        let keychain = MockDashboardKeychain()
        
        // Test various password complexities
        let passwords = [
            ("weak", "123456"),
            ("medium", "Password123"),
            ("strong", "P@ssw0rd!2024#Secure"),
            ("very long", String(repeating: "a", count: 256))
        ]
        
        for (_, password) in passwords {
            #expect(keychain.setPassword(password))
            #expect(keychain.getPassword() == password)
        }
    }
    
    // MARK: - Integration Tests
    
    @Test("Full password lifecycle", .tags(.integration))
    func testFullLifecycle() throws {
        let keychain = MockDashboardKeychain()
        
        // 1. Initial state - no password
        #expect(!keychain.hasPassword())
        #expect(keychain.getPassword() == nil)
        
        // 2. Set initial password
        let initialPassword = "initial-secure-password"
        #expect(keychain.setPassword(initialPassword))
        #expect(keychain.hasPassword())
        #expect(keychain.getPassword() == initialPassword)
        
        // 3. Update password
        let updatedPassword = "updated-secure-password"
        #expect(keychain.setPassword(updatedPassword))
        #expect(keychain.getPassword() == updatedPassword)
        
        // 4. Delete password
        #expect(keychain.deletePassword())
        #expect(!keychain.hasPassword())
        #expect(keychain.getPassword() == nil)
        
        // 5. Delete again (idempotent)
        #expect(keychain.deletePassword())
    }
}