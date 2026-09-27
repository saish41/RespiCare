import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Link2,
  Plus,
  Search,
  Signal,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import api from "../../services/api";


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


const getPatientEmail = (patient) =>
  patient?.patient_email ??
  patient?.email ??
  patient?.patient?.email ??
  "";


function reliable(monitoring) {
  const quality = String(
    monitoring?.signal_quality || "UNKNOWN"
  ).toUpperCase();

  return (
    monitoring?.status === "MONITORING" &&
    monitoring?.respiratory_rate != null &&
    ![
      "UNKNOWN",
      "UNRELIABLE",
      "SIGNAL_LOSS",
      "LOST",
      "POOR",
      "MOTION_ARTIFACT",
    ].includes(quality)
  );
}


function stateClass(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("_", "-");
}


export default function DoctorPatients() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const [loading, setLoading] = useState(true);


  /* =====================================================
     LINK PATIENT STATE
  ===================================================== */

  const [showLinkPatient, setShowLinkPatient] =
    useState(false);

  const [pairingCode, setPairingCode] =
    useState("");

  const [pairing, setPairing] =
    useState(false);

  const [pairError, setPairError] =
    useState("");

  const [pairSuccess, setPairSuccess] =
    useState("");


  /* =====================================================
     LOAD PATIENTS
  ===================================================== */

  const loadPatients = useCallback(async () => {
    try {
      const response = await api.get(
        "/connections/my-patients"
      );

      const raw = Array.isArray(response.data)
        ? response.data
        : [];


      const enriched = await Promise.all(
        raw.map(async (patient) => {
          const patientId = getPatientId(patient);

          if (!patientId) {
            return {
              ...patient,
              monitoring: null,
            };
          }

          try {
            const monitoring = await api.get(
              `/monitoring/patient/${patientId}/current`
            );

            return {
              ...patient,
              monitoring: monitoring.data,
            };
          } catch {
            return {
              ...patient,
              monitoring: null,
            };
          }
        })
      );


      setPatients(enriched);

    } catch (error) {
      console.error(
        "Unable to load doctor patients:",
        error
      );
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    loadPatients();

    const timer = setInterval(
      loadPatients,
      5000
    );

    return () => clearInterval(timer);
  }, [loadPatients]);


  /* =====================================================
     PAIR / LINK PATIENT
  ===================================================== */

  const handlePairingCodeChange = (event) => {
    const value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    setPairingCode(value);

    setPairError("");
    setPairSuccess("");
  };


  const linkPatient = async (event) => {
    event.preventDefault();

    const cleanCode = pairingCode
      .trim()
      .toUpperCase();


    if (cleanCode.length !== 6) {
      setPairError(
        "Enter the complete 6-character patient code."
      );

      return;
    }


    try {
      setPairing(true);

      setPairError("");
      setPairSuccess("");


      const response = await api.post(
        "/connections/pair",
        {
          code: cleanCode,
        }
      );


      const patientName =
        response.data?.patient_name ||
        response.data?.patient?.name ||
        "Patient";


      setPairSuccess(
        `${patientName} has been linked to your clinical workspace.`
      );


      setPairingCode("");


      await loadPatients();


      setTimeout(() => {
        setShowLinkPatient(false);
        setPairSuccess("");
      }, 1800);

    } catch (error) {
      console.error(error);


      const message =
        error.response?.data?.detail;


      if (typeof message === "string") {
        setPairError(message);
      } else {
        setPairError(
          "Unable to link this patient. Check the code and try again."
        );
      }

    } finally {
      setPairing(false);
    }
  };


  /* =====================================================
     FILTER PATIENTS
  ===================================================== */

  const filteredPatients = useMemo(() => {
    const query =
      search.trim().toLowerCase();


    return patients.filter((patient) => {
      const name =
        getPatientName(patient).toLowerCase();

      const email =
        getPatientEmail(patient).toLowerCase();

      const monitoring =
        patient.monitoring;

      const isLive =
        reliable(monitoring);

      const state = String(
        monitoring?.detector_state || ""
      ).toUpperCase();


      const matchesSearch =
        !query ||
        name.includes(query) ||
        email.includes(query);


      let matchesFilter = true;


      if (filter === "MONITORING") {
        matchesFilter = isLive;
      }


      if (filter === "ATTENTION") {
        matchesFilter = [
          "WATCH",
          "WARNING",
          "DISTRESS",
        ].includes(state);
      }


      if (filter === "SIGNAL") {
        matchesFilter =
          !isLive ||
          state === "SIGNAL_UNRELIABLE";
      }


      return (
        matchesSearch &&
        matchesFilter
      );
    });

  }, [
    patients,
    search,
    filter,
  ]);


  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="doctor-dashboard">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="doctor-page-header">

        <div>
          <p className="doctor-eyebrow">
            PATIENT DIRECTORY
          </p>

          <h1>My Patients</h1>

          <p>
            Review respiratory monitoring status and
            manage patients connected to your clinical
            workspace.
          </p>
        </div>


        <button
          type="button"
          className="doctor-primary-button"
          onClick={() => {
            setShowLinkPatient(true);
            setPairError("");
            setPairSuccess("");
          }}
        >
          <Plus size={17} />

          Link Patient
        </button>

      </header>


      {/* =================================================
          LINK PATIENT PANEL
      ================================================= */}

      {showLinkPatient && (
        <section className="doctor-link-patient-panel">

          <div className="doctor-link-patient-header">

            <div className="doctor-link-patient-title">

              <div className="doctor-link-patient-icon">
                <Link2 size={22} />
              </div>


              <div>
                <p className="doctor-section-kicker">
                  PATIENT CONNECTION
                </p>

                <h2>
                  Link a Patient
                </h2>

                <p>
                  Ask the patient to generate a temporary
                  connection code from their RespiCare
                  account.
                </p>
              </div>

            </div>


            <button
              type="button"
              className="doctor-link-close"
              onClick={() => {
                setShowLinkPatient(false);
                setPairingCode("");
                setPairError("");
                setPairSuccess("");
              }}
              title="Close"
            >
              <X size={20} />
            </button>

          </div>


          <form
            className="doctor-link-patient-form"
            onSubmit={linkPatient}
          >

            <div className="doctor-pair-code-area">

              <label>
                Patient connection code
              </label>


              <input
                type="text"
                value={pairingCode}
                onChange={
                  handlePairingCodeChange
                }
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
                autoFocus
              />


              <span>
                6-character one-time code
              </span>

            </div>


            <button
              type="submit"
              className="doctor-primary-button doctor-link-submit"
              disabled={
                pairing ||
                pairingCode.length !== 6
              }
            >
              <Link2 size={17} />

              {pairing
                ? "Linking..."
                : "Link Patient"}
            </button>

          </form>


          {pairError && (
            <div className="doctor-pair-message error">
              {pairError}
            </div>
          )}


          {pairSuccess && (
            <div className="doctor-pair-message success">
              <CheckCircle2 size={18} />

              {pairSuccess}
            </div>
          )}


          <div className="doctor-link-explanation">

            <div>
              <strong>1</strong>

              <span>
                Patient opens Connections
              </span>
            </div>


            <div className="doctor-link-line" />


            <div>
              <strong>2</strong>

              <span>
                Patient generates code
              </span>
            </div>


            <div className="doctor-link-line" />


            <div>
              <strong>3</strong>

              <span>
                Doctor enters code here
              </span>
            </div>


            <div className="doctor-link-line" />


            <div>
              <strong>4</strong>

              <span>
                Clinical access begins
              </span>
            </div>

          </div>

        </section>
      )}


      {/* =================================================
          SEARCH / FILTER
      ================================================= */}

      <div className="doctor-directory-toolbar">

        <div className="doctor-search-box">

          <Search size={18} />

          <input
            type="text"
            placeholder="Search patient by name or email..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

        </div>


        <div className="doctor-filter-tabs">

          {[
            ["ALL", "All"],
            [
              "MONITORING",
              "Monitoring",
            ],
            [
              "ATTENTION",
              "Attention",
            ],
            [
              "SIGNAL",
              "Signal issues",
            ],
          ].map(
            ([value, label]) => (
              <button
                type="button"
                key={value}
                className={
                  filter === value
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setFilter(value)
                }
              >
                {label}
              </button>
            )
          )}

        </div>

      </div>


      {/* =================================================
          PATIENT LIST
      ================================================= */}

      {loading ? (

        <div className="doctor-page-loading">
          <Activity
            className="doctor-spin"
            size={25}
          />

          Loading patients...
        </div>

      ) : filteredPatients.length === 0 ? (

        <div className="doctor-empty-state">

          <UsersRound size={31} />

          <h3>
            {patients.length === 0
              ? "No connected patients"
              : "No patients found"}
          </h3>


          <p>
            {patients.length === 0
              ? "Link your first patient using the temporary connection code generated from their RespiCare account."
              : "No connected patient matches the current search or filter."}
          </p>


          {patients.length === 0 && (
            <button
              type="button"
              className="doctor-primary-button"
              onClick={() =>
                setShowLinkPatient(true)
              }
            >
              <Link2 size={17} />

              Link First Patient
            </button>
          )}

        </div>

      ) : (

        <div className="doctor-directory-list">

          {filteredPatients.map(
            (patient) => {

              const patientId =
                getPatientId(patient);


              const monitoring =
                patient.monitoring || {};


              const isLive =
                reliable(monitoring);


              const detectorState =
                String(
                  monitoring.detector_state ||
                    (isLive
                      ? "NORMAL"
                      : "SIGNAL_UNRELIABLE")
                ).toUpperCase();


              return (
                <button
                  type="button"
                  key={patientId}
                  className="doctor-directory-row"
                  onClick={() =>
                    navigate(
                      `/doctor/patient/${patientId}`
                    )
                  }
                >

                  <div className="doctor-patient-avatar">
                    {getPatientName(patient)
                      .charAt(0)
                      .toUpperCase()}
                  </div>


                  <div className="doctor-directory-person">

                    <strong>
                      {getPatientName(patient)}
                    </strong>


                    <span>
                      {getPatientEmail(patient) ||
                        "Connected patient"}
                    </span>

                  </div>


                  <div className="doctor-directory-status">

                    {isLive ? (
                      <>
                        <Signal size={16} />
                        Monitoring
                      </>
                    ) : (
                      <>
                        <WifiOff size={16} />
                        Waiting
                      </>
                    )}

                  </div>


                  <div className="doctor-directory-bpm">

                    <strong>
                      {isLive
                        ? Math.round(
                            monitoring.respiratory_rate
                          )
                        : "--"}
                    </strong>

                    <span>BPM</span>

                  </div>


                  <span
                    className={`doctor-state-pill ${stateClass(
                      detectorState
                    )}`}
                  >
                    {detectorState.replaceAll(
                      "_",
                      " "
                    )}
                  </span>


                  <ArrowRight size={19} />

                </button>
              );
            }
          )}

        </div>
      )}

    </div>
  );
}