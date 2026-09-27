import {
  Activity,
  HeartPulse,
  Radio,
  History,
  ShieldCheck,
  Pill,
  FlaskConical,
  UserRound,
  LogOut,
} from "lucide-react";

import {
  NavLink,
  Outlet,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";


export default function PatientLayout() {

  const {
    user,
    logout,
  } = useAuth();


  return (

    <div className="dashboard-layout">

      <aside className="dashboard-sidebar">

        <div className="dashboard-logo">

          <div className="brand-icon">
            <Activity size={23} />
          </div>

          <span>
            RespiCare
          </span>

        </div>


        <nav className="sidebar-nav">

          <NavItem
            to="/patient"
            end
            icon={<HeartPulse size={19} />}
            label="Overview"
          />

          <NavItem
            to="/patient/monitoring"
            icon={<Radio size={19} />}
            label="Live Monitoring"
          />

          <NavItem
            to="/patient/history"
            icon={<History size={19} />}
            label="History"
          />

          <NavItem
            to="/patient/connections"
            icon={<ShieldCheck size={19} />}
            label="Care Team"
          />

          <NavItem
            to="/patient/medications"
            icon={<Pill size={19} />}
            label="Medications"
          />

        </nav>


        <div className="sidebar-divider">
          DEMONSTRATION
        </div>


        <NavItem
          to="/patient/simulation"
          icon={<FlaskConical size={19} />}
          label="Simulation"
          demo
        />


        <div className="sidebar-user">

          <div className="user-avatar">
            <UserRound size={20} />
          </div>


          <div className="sidebar-user-info">

            <strong>
              {user?.name}
            </strong>

            <span>
              Patient
            </span>

          </div>


          <button
            className="icon-button"
            onClick={logout}
            title="Logout"
          >

            <LogOut size={18} />

          </button>

        </div>

      </aside>


      <main className="dashboard-main">

        <Outlet />

      </main>

    </div>
  );
}


function NavItem({
  to,
  icon,
  label,
  end = false,
  demo = false,
}) {

  return (

    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        isActive
          ? `nav-item active ${
              demo ? "demo-nav" : ""
            }`
          : `nav-item ${
              demo ? "demo-nav" : ""
            }`
      }
    >

      {icon}

      <span>
        {label}
      </span>


      {demo && (
        <small className="nav-demo-badge">
          DEMO
        </small>
      )}

    </NavLink>
  );
}