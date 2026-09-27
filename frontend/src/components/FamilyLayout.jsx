import { Outlet } from "react-router-dom";
import FamilySidebar from "./FamilySidebar";


export default function FamilyLayout() {
  return (
    <div className="family-app-shell">

      <FamilySidebar />

      <main className="family-app-main">
        <Outlet />
      </main>

    </div>
  );
}