import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "./firebase";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const switchMode = (newMode) => {
    setMode(newMode);
    setError("");
    setEmail("");
    setPassword("");
  };

  const validate = () => {
    if (!email.trim()) return "Email is required.";
    if (!email.includes("@")) return "Please enter a valid email.";
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

    try {
      let userCredential;

      if (isLogin) {
        userCredential = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
      } else {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
      }

      onLogin(userCredential.user);
    } catch (error) {
      if (error.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (error.code === "auth/email-already-in-use") {
        setError("This email is already in use.");
      } else if (error.code === "auth/weak-password") {
        setError("Password should be at least 6 characters.");
      } else if (error.code === "auth/invalid-email") {
        setError("Please enter a valid email.");
      } else {
        setError(isLogin ? "Login failed." : "Registration failed.");
      }
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
            <label htmlFor="email" className="login-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={`input-control login-input ${error && !email.trim() ? "input-error" : ""}`}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`input-control login-input ${error && !password ? "input-error" : ""}`}
              placeholder={
                isLogin
                  ? "Enter your password"
                  : "Choose a password (min. 8 characters)"
              }
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading
              ? isLogin
                ? "Signing in..."
                : "Creating account..."
              : isLogin
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <p className="login-hint">
          {isLogin
            ? 'Don\'t have an account? Click "Create Account" above.'
            : 'Already have an account? Click "Sign In" above.'}
        </p>
      </div>
    </div>
  );
}
