import {
  UserRound,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../services/api";
import MedicationTracker from "./MedicationTracker";


export default function MedicationCarePage({
  role,
}) {
  const [patients, setPatients] =
    useState([]);

  const [
    selectedPatientId,
    setSelectedPatientId,
  ] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  useEffect(() => {
    const load = async () => {
      try {
        const response =
          await api.get(
            "/connections/my-patients"
          );

        const list =
          Array.isArray(
            response.data
          )
            ? response.data
            : [];

        setPatients(
          list
        );

        if (
          list.length > 0
        ) {
          setSelectedPatientId(
            getPatientId(
              list[0]
            )
          );
        }

        setError("");
      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
            "Unable to load connected patients."
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);


  const selectedPatient =
    useMemo(
      () =>
        patients.find(
          (patient) =>
            String(
              getPatientId(
                patient
              )
            ) ===
            String(
              selectedPatientId
            )
        ),
      [
        patients,
        selectedPatientId,
      ]
    );


  if (loading) {
    return (
      <div className="medtracker-loading">
        Loading patients...
      </div>
    );
  }


  if (
    patients.length === 0
  ) {
    return (
      <div className="medtracker-empty medtracker-no-patient">
        <UserRound
          size={32}
        />

        <h2>
          No connected
          patients
        </h2>

        <p>
          Connect to a patient
          before viewing their
          medication schedule.
        </p>
      </div>
    );
  }


  return (
    <>
      <section className="medtracker-patient-selector">
        <div>
          <span>
            VIEWING PATIENT
          </span>

          <strong>
            {role === "DOCTOR"
              ? "Medication adherence"
              : "Medication care"}
          </strong>
        </div>

        <select
          value={
            selectedPatientId
          }
          onChange={(
            event
          ) =>
            setSelectedPatientId(
              event.target
                .value
            )
          }
        >
          {patients.map(
            (patient) => (
              <option
                key={
                  getPatientId(
                    patient
                  )
                }
                value={
                  getPatientId(
                    patient
                  )
                }
              >
                {getPatientName(
                  patient
                )}
              </option>
            )
          )}
        </select>
      </section>

      {error && (
        <div className="medtracker-error">
          {error}
        </div>
      )}

      <MedicationTracker
        patientId={
          selectedPatientId
        }
        patientName={
          getPatientName(
            selectedPatient
          )
        }
        role={role}
      />
    </>
  );
}


function getPatientId(
  patient
) {
  return (
    patient?.patient_id ??
    patient?.patient?.id ??
    patient?.id ??
    ""
  );
}


function getPatientName(
  patient
) {
  return (
    patient?.patient_name ??
    patient?.patient?.name ??
    patient?.name ??
    "Patient"
  );
}