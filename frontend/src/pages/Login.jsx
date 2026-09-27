import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";

import { useAuth } from "../context/AuthContext";


export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);


  const handleChange = (event) => {
    setForm({
      ...form,
      [event.target.name]: event.target.value,
    });
  };


  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      const user = await login(
        form.email,
        form.password
      );

      if (user.role === "PATIENT") {
        navigate("/patient");
      } else if (user.role === "FAMILY") {
        navigate("/family");
      } else if (user.role === "DOCTOR") {
        navigate("/doctor");
      }

    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to sign in."
      );
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="auth-page">

      <div className="auth-brand-panel">

        <div className="brand">
          <div className="brand-icon">
            <Activity size={25} />
          </div>

          <span>RespiCare</span>
        </div>

        <div className="brand-message">
          <span className="eyebrow">
            RESPIRATORY CARE PLATFORM
          </span>

          <h1>
            Breathing insights,
            <br />
            when they matter.
          </h1>

          <p>
            Continuous respiratory monitoring designed
            to keep patients, families and care teams
            connected.
          </p>
        </div>

        <div className="decorative-wave">
          <svg viewBox="0 0 600 120">
            <path
              d="M0 65 C50 65 60 65 85 65 C110 65 112 25 130 25 C150 25 150 100 170 100 C190 100 190 45 210 45 C230 45 230 65 260 65 C330 65 380 65 600 65"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
          </svg>
        </div>

      </div>


      <div className="auth-form-panel">

        <div className="auth-card">

          <div className="mobile-brand">
            <Activity size={24} />
            <span>RespiCare</span>
          </div>

          <span className="eyebrow">
            WELCOME BACK
          </span>

          <h2>Sign in to RespiCare</h2>

          <p className="auth-description">
            Access your respiratory care dashboard.
          </p>


          <form onSubmit={handleSubmit}>

            <label>Email address</label>

            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />


            <label>Password</label>

            <input
              name="password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={handleChange}
              required
            />


            {error && (
              <div className="form-error">
                {error}
              </div>
            )}


            <button
              className="primary-button"
              disabled={submitting}
            >
              {submitting
                ? "Signing in..."
                : "Sign in"
              }

              {!submitting && (
                <ArrowRight size={18} />
              )}
            </button>

          </form>


          <p className="auth-switch">
            New to RespiCare?{" "}
            <Link to="/register">
              Create an account
            </Link>
          </p>

        </div>

      </div>

    </div>
  );
}