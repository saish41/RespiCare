import {
  useEffect,
  useRef,
} from "react";


export default function RespiratoryWaveform({
  respiratoryRate = null,
  amplitude = null,
  signalQuality = "UNKNOWN",
  pattern = "NO_DATA",
  active = false,
}) {

  const canvasRef = useRef(null);

  const animationRef = useRef(null);


  const stateRef = useRef({
    rate: null,
    amplitude: null,
    quality: "UNKNOWN",
    pattern: "NO_DATA",
    active: false,
  });


  useEffect(() => {

    stateRef.current = {
      rate: respiratoryRate,
      amplitude,
      quality: signalQuality,
      pattern,
      active,
    };

  }, [
    respiratoryRate,
    amplitude,
    signalQuality,
    pattern,
    active,
  ]);


  useEffect(() => {

    const canvas =
      canvasRef.current;

    if (!canvas)
      return;


    const context =
      canvas.getContext("2d");


    let phase = 0;

    let lastTime =
      performance.now();


    let displayedRate = null;

    let displayedAmplitude = 0;


    // =====================================================
    // RESIZE
    // =====================================================

    const resizeCanvas = () => {

      const rect =
        canvas.getBoundingClientRect();


      const ratio =
        window.devicePixelRatio || 1;


      canvas.width =
        Math.max(
          1,
          Math.floor(
            rect.width * ratio
          )
        );


      canvas.height =
        Math.max(
          1,
          Math.floor(
            rect.height * ratio
          )
        );


      context.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
      );
    };


    resizeCanvas();


    window.addEventListener(
      "resize",
      resizeCanvas
    );


    // =====================================================
    // GRID
    // =====================================================

    const drawGrid = (
      width,
      height
    ) => {

      context.strokeStyle =
        "rgba(21, 133, 103, 0.055)";


      context.lineWidth = 1;


      const gridSize = 35;


      for (
        let x = 0;
        x <= width;
        x += gridSize
      ) {

        context.beginPath();

        context.moveTo(
          x,
          0
        );

        context.lineTo(
          x,
          height
        );

        context.stroke();
      }


      for (
        let y = 0;
        y <= height;
        y += gridSize
      ) {

        context.beginPath();

        context.moveTo(
          0,
          y
        );

        context.lineTo(
          width,
          y
        );

        context.stroke();
      }
    };


    // =====================================================
    // FLAT LINE
    // =====================================================

    const drawFlatLine = (
      width,
      height
    ) => {

      context.beginPath();

      context.moveTo(
        0,
        height / 2
      );

      context.lineTo(
        width,
        height / 2
      );


      context.strokeStyle =
        "#9dbab0";


      context.lineWidth = 2;


      context.stroke();
    };


    // =====================================================
    // MOTION ARTIFACT
    // =====================================================

    const drawMotionArtifact = (
      width,
      height
    ) => {

      context.beginPath();


      for (
        let x = 0;
        x <= width;
        x += 3
      ) {

        const noise =
          (
            Math.random() -
            0.5
          ) * 90;


        const y =
          height / 2 +
          noise;


        if (x === 0) {

          context.moveTo(
            x,
            y
          );

        } else {

          context.lineTo(
            x,
            y
          );
        }
      }


      context.strokeStyle =
        "#b88946";


      context.lineWidth = 2;


      context.stroke();
    };


    // =====================================================
    // ANIMATION
    // =====================================================

    const animate = (time) => {

      const delta =
        Math.min(
          (
            time -
            lastTime
          ) / 1000,
          0.05
        );


      lastTime = time;


      const target =
        stateRef.current;


      const rect =
        canvas.getBoundingClientRect();


      const width =
        rect.width;


      const height =
        rect.height;


      context.clearRect(
        0,
        0,
        width,
        height
      );


      drawGrid(
        width,
        height
      );


      // ===================================================
      // NO ACTIVE SOURCE
      // ===================================================

      const hasSignal =
        target.active === true &&
        target.rate !== null &&
        target.rate !== undefined &&
        target.quality !== "UNRELIABLE" &&
        target.quality !== "UNKNOWN";


      if (!hasSignal) {

        displayedRate = null;

        displayedAmplitude = 0;

        drawFlatLine(
          width,
          height
        );


        animationRef.current =
          requestAnimationFrame(
            animate
          );


        return;
      }


      // ===================================================
      // MOTION ARTIFACT
      // ===================================================

      if (
        target.pattern ===
        "MOTION_ARTIFACT"
      ) {

        drawMotionArtifact(
          width,
          height
        );


        animationRef.current =
          requestAnimationFrame(
            animate
          );


        return;
      }


      // ===================================================
      // INITIALISE DISPLAY VALUES
      // ===================================================

      if (
        displayedRate === null
      ) {

        displayedRate =
          target.rate;
      }


      // Smooth transition instead of jump.

      displayedRate +=
        (
          target.rate -
          displayedRate
        ) * 0.035;


      const targetAmplitude =
        target.amplitude ??
        1;


      displayedAmplitude +=
        (
          targetAmplitude -
          displayedAmplitude
        ) * 0.04;


      // ===================================================
      // PHASE
      // ===================================================

      const breathsPerSecond =
        displayedRate / 60;


      phase +=
        delta *
        breathsPerSecond *
        Math.PI *
        2;


      const visualAmplitude =
        Math.min(
          height * 0.32,
          70
        ) *
        displayedAmplitude;


      // ===================================================
      // DRAW WAVE
      // ===================================================

      context.beginPath();


      const visibleCycles =
        3.2;


      for (
        let x = 0;
        x <= width;
        x += 2
      ) {

        const normalizedX =
          x / width;


        const wavePhase =
          (
            normalizedX *
            visibleCycles *
            Math.PI *
            2
          ) -
          phase;


        let wave =
          Math.sin(
            wavePhase
          );


        // Gives a slightly less artificial
        // respiratory shape.

        wave +=
          0.12 *
          Math.sin(
            wavePhase * 2
          );


        let localAmplitude =
          visualAmplitude;


        // ===============================================
        // BREATHING PAUSE
        // ===============================================

        if (
          target.pattern ===
          "BREATHING_PAUSE"
        ) {

          const cyclePosition =
            (
              normalizedX +
              phase /
              (
                Math.PI *
                2
              )
            ) % 1;


          if (
            cyclePosition >
            0.67 &&
            cyclePosition <
            0.91
          ) {

            localAmplitude *=
              0.03;
          }
        }


        const y =
          height / 2 -
          (
            wave *
            localAmplitude
          );


        if (x === 0) {

          context.moveTo(
            x,
            y
          );

        } else {

          context.lineTo(
            x,
            y
          );
        }
      }


      context.strokeStyle =
        "#15906c";


      context.lineWidth = 3;


      context.lineCap =
        "round";


      context.lineJoin =
        "round";


      context.stroke();


      animationRef.current =
        requestAnimationFrame(
          animate
        );
    };


    animationRef.current =
      requestAnimationFrame(
        animate
      );


    return () => {

      if (
        animationRef.current
      ) {

        cancelAnimationFrame(
          animationRef.current
        );
      }


      window.removeEventListener(
        "resize",
        resizeCanvas
      );
    };

  }, []);


  return (

    <div className="smooth-waveform">

      <canvas
        ref={canvasRef}
        className="respiratory-canvas"
      />

    </div>
  );
}