import {
  Activity,
  Bell,
  HeartHandshake,
  History,
  LayoutDashboard,
  LogOut,
  Pill,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";


export default function FamilySidebar() {
  const { user, logout } = useAuth();

  const navigate = useNavigate();


  const handleLogout = () => {
    logout();
    navigate("/login");
  };


  return (
    <aside className="family-sidebar">

      {/* =================================================
          BRAND
      ================================================= */}

      <div className="family-sidebar-brand">

        <div className="family-brand-icon">
          <Activity size={21} />
        </div>

        <div>
          <strong>RespiCare</strong>
          <span>Family Care</span>
        </div>

      </div>


      {/* =================================================
          CARE NAVIGATION
      ================================================= */}

      <div className="family-sidebar-section-label">
        CARE
      </div>


      <nav className="family-sidebar-nav">

        <SidebarLink
          to="/family"
          end
          icon={<LayoutDashboard size={18} />}
        >
          Overview
        </SidebarLink>


        <SidebarLink
          to="/family/connections"
          icon={<UsersRound size={18} />}
        >
          My Patients
        </SidebarLink>


        <SidebarLink
          to="/family/alerts"
          icon={<Bell size={18} />}
        >
          Alerts
        </SidebarLink>


        <SidebarLink
          to="/family/medications"
          icon={<Pill size={18} />}
        >
          Medications
        </SidebarLink>


        <SidebarLink
          to="/family/history"
          icon={<History size={18} />}
        >
          History
        </SidebarLink>

      </nav>


      {/* =================================================
          CONNECTION
      ================================================= */}

      <div className="family-sidebar-section-label family-support-label">
        CONNECTIONS
      </div>


      <NavLink
        to="/family/connections"
        className="family-connect-sidebar-card"
      >

        <div>
          <HeartHandshake size={19} />
        </div>


        <span>
          <strong>Connect Patient</strong>
          <small>Use pairing code</small>
        </span>

      </NavLink>


      {/* =================================================
          ACCOUNT
      ================================================= */}

      <div className="family-sidebar-bottom">

        <div className="family-sidebar-user">

          <div className="family-sidebar-avatar">
            <UserRound size={18} />
          </div>


          <div>
            <strong>
              {user?.name || "Guardian"}
            </strong>

            <span>
              Family Guardian
            </span>
          </div>

        </div>


        <button
          type="button"
          className="family-sidebar-logout"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          Logout
        </button>

      </div>

    </aside>
  );
}


/* =====================================================
   SIDEBAR LINK
===================================================== */

function SidebarLink({
  to,
  icon,
  children,
  end = false,
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        isActive
          ? "family-nav-link active"
          : "family-nav-link"
      }
    >
      {icon}

      <span>
        {children}
      </span>

    </NavLink>
  );
}