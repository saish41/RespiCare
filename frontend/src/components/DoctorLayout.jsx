import { Outlet } from "react-router-dom";
import DoctorSidebar from "./DoctorSidebar";


export default function DoctorLayout() {
  return (
    <div className="doctor-app-shell">

      <DoctorSidebar />

      <main className="doctor-app-main">
        <Outlet />
      </main>

    </div>
  );
}