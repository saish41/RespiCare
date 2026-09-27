import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  UserRound,
  Users,
  Stethoscope,
  ArrowRight,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";


const roles = [
  {
    value: "PATIENT",
    title: "Patient",
    description: "Monitor my breathing",
    icon: UserRound,
  },
  {
    value: "FAMILY",
    title: "Family",
    description: "Support a loved one",
    icon: Users,
  },
  {
    value: "DOCTOR",
    title: "Doctor",
    description: "Monitor my patients",
    icon: Stethoscope,
  },
];


export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "PATIENT",
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
      const user = await register(form);

      if (user.role === "PATIENT") {
        navigate("/patient");
      } else if (user.role === "FAMILY") {
        navigate("/family");
      } else {
        navigate("/doctor");
      }

    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to create account."
      );
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="register-page">

      <div className="register-card">

        <div className="brand register-brand">
          <div className="brand-icon">
            <Activity size={23} />
          </div>

          <span>RespiCare</span>
        </div>


        <div className="register-heading">
          <span className="eyebrow">
            GET STARTED
          </span>

          <h1>Create your account</h1>

          <p>
            Choose how you'll use RespiCare.
          </p>
        </div>


        <div className="role-grid">

          {roles.map((role) => {
            const Icon = role.icon;

            return (
              <button
                type="button"
                key={role.value}
                className={
                  form.role === role.value
                    ? "role-card selected"
                    : "role-card"
                }
                onClick={() =>
                  setForm({
                    ...form,
                    role: role.value,
                  })
                }
              >
                <Icon size={22} />

                <div>
                  <strong>{role.title}</strong>
                  <span>{role.description}</span>
                </div>
              </button>
            );
          })}

        </div>


        <form onSubmit={handleSubmit}>

          <div className="two-column">

            <div>
              <label>Full name</label>

              <input
                name="name"
                placeholder="Your name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label>Email address</label>

              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

          </div>


          <label>Password</label>

          <input
            name="password"
            type="password"
            placeholder="Minimum 6 characters"
            minLength="6"
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
              ? "Creating account..."
              : "Create account"
            }

            {!submitting && (
              <ArrowRight size={18} />
            )}
          </button>

        </form>


        <p className="auth-switch">
          Already have an account?{" "}
          <Link to="/login">
            Sign in
          </Link>
        </p>

      </div>

    </div>
  );
}