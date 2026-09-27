import {
  BellRing,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Pill,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext";
import api from "../services/api";


export default function DoctorSidebar() {
  const { user, logout } = useAuth();

  const [unreadAlerts, setUnreadAlerts] = useState(0);


  useEffect(() => {
    let mounted = true;

    const loadAlerts = async () => {
      try {
        const response = await api.get("/alerts/my-alerts");

        if (!mounted) return;

        const alerts = Array.isArray(response.data)
          ? response.data
          : [];

        setUnreadAlerts(
          alerts.filter((alert) => !alert.acknowledged).length
        );
      } catch {
        // Sidebar should never crash because alerts failed.
      }
    };

    loadAlerts();

    const timer = setInterval(loadAlerts, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);


  const links = [
    {
      to: "/doctor",
      label: "Overview",
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: "/doctor/patients",
      label: "My Patients",
      icon: UsersRound,
    },
    {
      to: "/doctor/alerts",
      label: "Clinical Alerts",
      icon: BellRing,
      badge: unreadAlerts,
    },
    {
      to: "/doctor/prescriptions",
      label: "Prescriptions",
      icon: Pill,
    },
    {
      to: "/doctor/history",
      label: "Monitoring History",
      icon: History,
    },
  ];


  return (
    <aside className="doctor-sidebar">

      <div className="doctor-sidebar-brand">
        <div className="doctor-brand-icon">
          <Stethoscope size={24} />
        </div>

        <div>
          <strong>RespiCare</strong>
          <span>Clinical Workspace</span>
        </div>
      </div>


      <div className="doctor-sidebar-label">
        CLINICAL
      </div>


      <nav className="doctor-sidebar-nav">
        {links.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `doctor-nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} />

              <span>{item.label}</span>

              {item.badge > 0 && (
                <span className="doctor-nav-badge">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>


      <div className="doctor-sidebar-access">
        <div className="doctor-access-icon">
          <ClipboardList size={18} />
        </div>

        <div>
          <strong>Clinical Access</strong>
          <span>
            Connected patients only
          </span>
        </div>
      </div>


      <div className="doctor-sidebar-user">
        <div className="doctor-user-avatar">
          {user?.name?.charAt(0)?.toUpperCase() || "D"}
        </div>

        <div className="doctor-user-details">
          <strong>
            {user?.name || "Doctor"}
          </strong>

          <span>Doctor</span>
        </div>

        <button
          type="button"
          className="doctor-logout-button"
          onClick={logout}
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>

    </aside>
  );
}