import { useState } from "react";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setUsername("");
    setPassword("");
  };

  const validate = () => {
    if (!username.trim()) return "Username is required.";
    if (username.trim().length < 2) return "Username must be at least 2 characters.";
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (isLogin ? "Login failed." : "Registration failed."));
        return;
      }

      onLogin(data);
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src="/app-icon.png" alt="App Icon" className="login-app-icon" />
        <h1 className="login-title">Smart Study Planner</h1>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${isLogin ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-tab ${!isLogin ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="username" className="login-label">Username</label>
            <input
              id="username"
              type="text"
              className={`input-control login-input ${error && !username.trim() ? "input-error" : ""}`}
              placeholder="Enter your username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">Password</label>
            <input
              id="password"
              type="password"
              className={`input-control login-input ${error && !password ? "input-error" : ""}`}
              placeholder={isLogin ? "Enter your password" : "Choose a password (min. 8 characters)"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? (isLogin ? "Signing in..." : "Creating account...")
              : (isLogin ? "Sign In" : "Create Account")}
          </button>
        </form>

        <p className="login-hint">
          {isLogin
            ? "Don't have an account? Click \"Create Account\" above."
            : "Already have an account? Click \"Sign In\" above."}
        </p>
      </div>
    </div>
  );
}
