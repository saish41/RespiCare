import {
  CheckCircle2,
  Loader2,
  Pill,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../../services/api";


export default function DoctorPrescriptions() {
  const [patients, setPatients] =
    useState([]);

  const [selectedPatientId, setSelectedPatientId] =
    useState("");

  const [medications, setMedications] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");


  const [form, setForm] =
    useState({
      medicine_name: "",
      dosage: "",
      schedule: "",
      instructions: "",
    });


  /* =====================================================
     PATIENT HELPERS
  ===================================================== */

  const getPatientId = (patient) =>
    patient?.patient_id ??
    patient?.id ??
    patient?.patient?.id ??
    null;


  const getPatientName = (patient) =>
    patient?.patient_name ??
    patient?.name ??
    patient?.patient?.name ??
    "Patient";


  /* =====================================================
     LOAD PATIENTS
  ===================================================== */

  const loadPatients =
    useCallback(async () => {
      try {
        const response =
          await api.get(
            "/connections/my-patients"
          );


        const list =
          Array.isArray(response.data)
            ? response.data
            : [];


        setPatients(list);


        if (
          list.length > 0 &&
          !selectedPatientId
        ) {
          setSelectedPatientId(
            String(
              getPatientId(
                list[0]
              )
            )
          );
        }

      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
            "Unable to load patients."
        );
      } finally {
        setLoading(false);
      }
    }, [selectedPatientId]);


  useEffect(() => {
    loadPatients();
  }, [loadPatients]);


  /* =====================================================
     LOAD PRESCRIPTIONS
  ===================================================== */

  const loadMedications =
    useCallback(async () => {

      if (!selectedPatientId) {
        setMedications([]);
        return;
      }


      try {
        const response =
          await api.get(
            `/medications/patient/${selectedPatientId}`
          );


        setMedications(
          Array.isArray(response.data)
            ? response.data
            : []
        );

      } catch (err) {
        console.error(err);

        setMedications([]);
      }

    }, [selectedPatientId]);


  useEffect(() => {
    loadMedications();
  }, [loadMedications]);


  /* =====================================================
     CREATE
  ===================================================== */

  const createPrescription =
    async (event) => {
      event.preventDefault();


      if (!selectedPatientId) {
        setError(
          "Select a patient first."
        );

        return;
      }


      if (
        !form.medicine_name.trim() ||
        !form.dosage.trim() ||
        !form.schedule.trim()
      ) {
        setError(
          "Medicine, dosage and schedule are required."
        );

        return;
      }


      try {
        setSaving(true);
        setError("");


        await api.post(
          "/medications/prescriptions",
          {
            patient_id:
              Number(
                selectedPatientId
              ),

            medicine_name:
              form.medicine_name.trim(),

            dosage:
              form.dosage.trim(),

            schedule:
              form.schedule.trim(),

            instructions:
              form.instructions.trim(),
          }
        );


        setForm({
          medicine_name: "",
          dosage: "",
          schedule: "",
          instructions: "",
        });


        await loadMedications();

      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
            "Unable to create prescription."
        );
      } finally {
        setSaving(false);
      }
    };


  /* =====================================================
     STOP
  ===================================================== */

  const stopPrescription =
    async (id) => {

      if (
        !window.confirm(
          "Stop this prescription?"
        )
      ) {
        return;
      }


      try {
        await api.delete(
          `/medications/prescriptions/${id}`
        );

        await loadMedications();

      } catch (err) {
        console.error(err);

        setError(
          err.response?.data?.detail ||
            "Unable to stop prescription."
        );
      }
    };


  return (
    <div className="doctor-dashboard">

      <header className="doctor-page-header">

        <div>

          <span className="doctor-eyebrow">
            TREATMENT MANAGEMENT
          </span>

          <h1>
            Prescriptions
          </h1>

          <p>
            Create and manage prescriptions
            for patients connected to your
            Doctor account.
          </p>

        </div>

      </header>


      {error && (
        <div className="doctor-error">
          {error}
        </div>
      )}


      <section className="doctor-panel">

        <div className="doctor-panel-header">

          <div>

            <span className="doctor-eyebrow">
              SELECT PATIENT
            </span>

            <h2>
              Patient Treatment Plan
            </h2>

          </div>

        </div>


        {loading ? (

          <div className="doctor-loading">

            <Loader2
              size={22}
              className="spin-icon"
            />

            Loading patients...

          </div>

        ) : patients.length === 0 ? (

          <div className="doctor-empty">

            <UserRound size={28} />

            <h3>
              No connected patients
            </h3>

            <p>
              Connect a patient before
              creating prescriptions.
            </p>

          </div>

        ) : (

          <>
            <select
              className="doctor-patient-select"
              value={
                selectedPatientId
              }
              onChange={(event) =>
                setSelectedPatientId(
                  event.target.value
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


            <form
              className="doctor-prescription-form"
              onSubmit={
                createPrescription
              }
            >

              <div className="doctor-form-grid">

                <Field
                  label="Medicine"
                  value={
                    form.medicine_name
                  }
                  placeholder="Medicine name"
                  onChange={(value) =>
                    setForm({
                      ...form,
                      medicine_name:
                        value,
                    })
                  }
                />


                <Field
                  label="Dosage"
                  value={
                    form.dosage
                  }
                  placeholder="e.g. 500 mg"
                  onChange={(value) =>
                    setForm({
                      ...form,
                      dosage: value,
                    })
                  }
                />


                <Field
                  label="Schedule"
                  value={
                    form.schedule
                  }
                  placeholder="e.g. Twice daily"
                  onChange={(value) =>
                    setForm({
                      ...form,
                      schedule:
                        value,
                    })
                  }
                />


                <Field
                  label="Instructions"
                  value={
                    form.instructions
                  }
                  placeholder="Optional"
                  onChange={(value) =>
                    setForm({
                      ...form,
                      instructions:
                        value,
                    })
                  }
                />

              </div>


              <button
                type="submit"
                className="doctor-primary-button"
                disabled={saving}
              >

                {saving ? (
                  <>
                    <Loader2
                      size={17}
                      className="spin-icon"
                    />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus size={17} />
                    Create Prescription
                  </>
                )}

              </button>

            </form>

          </>
        )}

      </section>


      <section className="doctor-panel">

        <div className="doctor-panel-header">

          <div>

            <span className="doctor-eyebrow">
              ACTIVE TREATMENT
            </span>

            <h2>
              Current Prescriptions
            </h2>

          </div>

        </div>


        {medications.length === 0 ? (

          <div className="doctor-empty">

            <Pill size={27} />

            <h3>
              No prescriptions
            </h3>

            <p>
              This patient currently has
              no prescription records.
            </p>

          </div>

        ) : (

          <div className="doctor-prescription-list">

            {medications.map(
              (medication) => (
                <div
                  key={
                    medication.id
                  }
                  className="doctor-prescription-row"
                >

                  <div className="doctor-prescription-icon">
                    <Pill size={19} />
                  </div>


                  <div className="doctor-prescription-info">

                    <strong>
                      {
                        medication.medicine_name
                      }
                    </strong>

                    <span>
                      {medication.dosage}
                      {" • "}
                      {medication.schedule}
                    </span>


                    {medication.instructions && (
                      <p>
                        {
                          medication.instructions
                        }
                      </p>
                    )}

                  </div>


                  <div className="doctor-adherence">

                    <span>
                      Today
                    </span>

                    <strong
                      className={
                        medication.today
                          ?.taken
                          ? "taken"
                          : ""
                      }
                    >
                      {medication.today
                        ?.taken
                        ? "Taken"
                        : "Pending"}
                    </strong>

                  </div>


                  {medication.is_active !==
                    false && (
                    <button
                      type="button"
                      className="doctor-stop-button"
                      onClick={() =>
                        stopPrescription(
                          medication.id
                        )
                      }
                    >
                      <Trash2 size={16} />
                      Stop
                    </button>
                  )}

                </div>
              )
            )}

          </div>
        )}

      </section>

    </div>
  );
}


function Field({
  label,
  value,
  placeholder,
  onChange,
}) {
  return (
    <label className="doctor-field">

      <span>
        {label}
      </span>

      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
      />

    </label>
  );
}