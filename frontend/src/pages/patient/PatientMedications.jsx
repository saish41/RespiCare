import MedicationTracker from "../../components/MedicationTracker";
import { useAuth } from "../../context/AuthContext";


export default function PatientMedications() {
  const { user } =
    useAuth();

  if (!user?.id) {
    return null;
  }

  return (
    <MedicationTracker
      patientId={
        user.id
      }
      patientName={
        user.name ||
        "You"
      }
      role="PATIENT"
    />
  );
}