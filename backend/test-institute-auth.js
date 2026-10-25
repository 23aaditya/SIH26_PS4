const BASE_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("=== AICTE PS4 Institute User Auth & Forgot Password Verification ===\n");
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
    }
  }

  try {
    // 1. Check user existence in DB
    console.log("1. Testing non-existent user check...");
    const notFoundRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "unknown-college@example.edu",
        password: "password123",
      }),
    });
    const notFoundData = await notFoundRes.json();
    assert(notFoundRes.status === 404, "Returns 404 when user does not exist in DB");
    assert(notFoundData.error?.includes("No account found"), "Provides descriptive message for unregistered user");

    // 2. Check password matching
    console.log("\n2. Testing incorrect password check...");
    const wrongPassRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        password: "wrong-password-999",
      }),
    });
    const wrongPassData = await wrongPassRes.json();
    assert(wrongPassRes.status === 401, "Returns 401 when password does not match");
    assert(wrongPassData.error?.includes("Incorrect password"), "Provides password mismatch guidance");

    // 3. Successful login returns user ID & email
    console.log("\n3. Testing valid login & user ID / email storage payload...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        password: "password123",
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200, "Valid credentials return 200 OK");
    assert(Boolean(loginData.user?.id || loginData.user?.uid), "User ID is returned in response");
    assert(loginData.user?.email === "principal@pict.edu", "User email is returned in response");
    assert(loginData.user?.accountType === "institution", "Account type is confirmed as institution");
    assert(Boolean(loginData.user?.institutionId), "Institution ID is associated with session");

    // 4. Forgot password request OTP
    console.log("\n4. Testing Forgot Password OTP dispatch...");
    const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "principal@pict.edu" }),
    });
    const forgotData = await forgotRes.json();
    assert(forgotRes.status === 200, "Forgot password endpoint returns 200 OK");
    assert(forgotData.success === true, "OTP dispatch succeeds");
    assert(forgotData.demoOtp === "202604", "Demo OTP code generated");

    // 5. Reset password using OTP
    console.log("\n5. Testing Reset Password with OTP...");
    const resetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        otp: "202604",
        newPassword: "newsecretpass123",
      }),
    });
    const resetData = await resetRes.json();
    assert(resetRes.status === 200, "Password reset returns 200 OK");
    assert(resetData.success === true, "Password successfully updated in SQLite database");

    // 6. Verify login with the new password
    console.log("\n6. Testing Login with Newly Set Password...");
    const newLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        password: "newsecretpass123",
      }),
    });
    assert(newLoginRes.status === 200, "Login succeeds with the newly updated password");

    // Reset password back to password123 for seamless demo consistency
    await fetch(`${BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        otp: "202604",
        newPassword: "password123",
      }),
    });
    console.log("Password restored to default 'password123' for subsequent tests.");

    console.log(`\n====================================================`);
    console.log(`Test Results: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
    console.log(`====================================================`);

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

runTests();
