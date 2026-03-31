import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './App.css';

// Tipos para las articulaciones del stickman
interface JointAngles {
  rightArmX: number;
  rightArmZ: number;
  leftArmX: number;
  leftArmZ: number;
  rightLegX: number;
  leftLegX: number;
  headTilt: number;
}

// Configuración de animaciones predefinidas
const animationPresets: Record<string, (time: number) => Partial<JointAngles>> = {
  idle: (time) => ({
    rightArmX: Math.sin(time * 2) * 0.1,
    leftArmX: Math.sin(time * 2 + Math.PI) * 0.1,
    rightLegX: Math.sin(time * 1.5) * 0.05,
    leftLegX: Math.sin(time * 1.5 + Math.PI) * 0.05,
  }),
  walk: (time) => ({
    rightArmX: Math.sin(time * 4) * 0.5,
    leftArmX: Math.sin(time * 4 + Math.PI) * 0.5,
    rightLegX: Math.sin(time * 4) * 0.6,
    leftLegX: Math.sin(time * 4 + Math.PI) * 0.6,
  }),
  run: (time) => ({
    rightArmX: Math.sin(time * 8) * 0.8,
    leftArmX: Math.sin(time * 8 + Math.PI) * 0.8,
    rightLegX: Math.sin(time * 8) * 1.0,
    leftLegX: Math.sin(time * 8 + Math.PI) * 1.0,
  }),
  wave: (time) => ({
    rightArmX: Math.sin(time * 6) * 0.3 + 1.5,
    rightArmZ: Math.cos(time * 6) * 0.2,
    leftArmX: -0.2,
  }),
  jump: (time) => {
    const jumpCycle = Math.sin(time * 3);
    return {
      rightArmX: jumpCycle > 0 ? -1.5 : 0,
      leftArmX: jumpCycle > 0 ? -1.5 : 0,
      rightLegX: jumpCycle > 0 ? 0.5 : 0,
      leftLegX: jumpCycle > 0 ? 0.5 : 0,
    };
  },
  dance: (time) => ({
    rightArmX: Math.sin(time * 5) * 0.7,
    leftArmX: Math.cos(time * 5) * 0.7,
    rightLegX: Math.sin(time * 5 + Math.PI / 4) * 0.5,
    leftLegX: Math.cos(time * 5 + Math.PI / 4) * 0.5,
    headTilt: Math.sin(time * 3) * 0.2,
  }),
  punch: (time) => {
    const punch = Math.sin(time * 2);
    return {
      rightArmX: punch > 0 ? punch * 2 : 0,
      leftArmX: -0.3,
    };
  },
  kick: (time) => {
    const kick = Math.sin(time * 2);
    return {
      rightLegX: kick > 0 ? kick * 1.5 : 0,
      leftLegX: -0.2,
    };
  },
};

const App: React.FC = () => {
  // Estados de la aplicación
  const [activeTab, setActiveTab] = useState<'appearance' | 'animation' | 'export'>('appearance');
  const [stickmanColor, setStickmanColor] = useState('#ffffff');
  const [headSize, setHeadSize] = useState(1.0);
  const [bodyThickness, setBodyThickness] = useState(0.1);
  const [armLength, setArmLength] = useState(1.0);
  const [legLength, setLegLength] = useState(1.0);
  const [cameraZoom, setCameraZoom] = useState(8);
  const [currentAnimation, setCurrentAnimation] = useState<string>('idle');
  const [isPlaying, setIsPlaying] = useState(true);
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [jointAngles, setJointAngles] = useState<JointAngles>({
    rightArmX: 0,
    rightArmZ: 0,
    leftArmX: 0,
    leftArmZ: 0,
    rightLegX: 0,
    leftLegX: 0,
    headTilt: 0,
  });
  const [isRecording, setIsRecording] = useState(false);
  const [videoFormat, setVideoFormat] = useState('webm');
  const [videoQuality, setVideoQuality] = useState('medium');
  const [videoFps, setVideoFps] = useState(30);
  const [videoDuration, setVideoDuration] = useState(5);
  const [recordingProgress, setRecordingProgress] = useState(0);

  // Referencias para Three.js
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const stickmanRef = useRef<THREE.Group | null>(null);
  const jointsRef = useRef<Record<string, THREE.Object3D>>({});
  const animationFrameRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Inicializar escena Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    // Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);
    sceneRef.current = scene;

    // Cámara
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.5, 5);
    cameraRef.current = camera;

    // Renderizador
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controles de órbita
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.target.set(0, 1, 0);
    controlsRef.current = controls;

    // Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x667eea, 0.5);
    pointLight.position.set(-5, 5, -5);
    scene.add(pointLight);

    // Suelo con grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    const planeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a1a,
      roughness: 0.8,
      metalness: 0.2
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // Crear StickMan
    createStickman(scene);

    // Loop de animación
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      const elapsed = clockRef.current.getElapsedTime();

      controls.update();

      // Actualizar animación
      if (isPlaying && stickmanRef.current) {
        const animationFn = animationPresets[currentAnimation];
        if (animationFn) {
          const angles = animationFn(elapsed * animationSpeed);
          updateJoints(angles);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Manejar resize
    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Crear el StickMan 3D
  const createStickman = (scene: THREE.Scene) => {
    const group = new THREE.Group();
    
    const material = new THREE.MeshStandardMaterial({
      color: stickmanColor,
      roughness: 0.4,
      metalness: 0.6,
    });

    // Cabeza
    const headGeometry = new THREE.SphereGeometry(0.3 * headSize, 32, 32);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);

    // Cuerpo
    const bodyGeometry = new THREE.CylinderGeometry(
      bodyThickness * 0.8,
      bodyThickness,
      0.8,
      16
    );
    const body = new THREE.Mesh(bodyGeometry, material);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    // Brazo derecho
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.25, 1.5, 0);
    
    const rightArmGeometry = new THREE.CylinderGeometry(
      bodyThickness * 0.4,
      bodyThickness * 0.3,
      0.6 * armLength,
      16
    );
    const rightArm = new THREE.Mesh(rightArmGeometry, material);
    rightArm.position.y = -0.3 * armLength;
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    rightArmGroup.add(rightArm);
    
    group.add(rightArmGroup);
    jointsRef.current.rightArm = rightArmGroup;

    // Brazo izquierdo
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.25, 1.5, 0);
    
    const leftArmGeometry = new THREE.CylinderGeometry(
      bodyThickness * 0.4,
      bodyThickness * 0.3,
      0.6 * armLength,
      16
    );
    const leftArm = new THREE.Mesh(leftArmGeometry, material);
    leftArm.position.y = -0.3 * armLength;
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = true;
    leftArmGroup.add(leftArm);
    
    group.add(leftArmGroup);
    jointsRef.current.leftArm = leftArmGroup;

    // Pierna derecha
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.15, 0.8, 0);
    
    const rightLegGeometry = new THREE.CylinderGeometry(
      bodyThickness * 0.45,
      bodyThickness * 0.35,
      0.7 * legLength,
      16
    );
    const rightLeg = new THREE.Mesh(rightLegGeometry, material);
    rightLeg.position.y = -0.35 * legLength;
    rightLeg.castShadow = true;
    rightLegGroup.add(rightLeg);
    
    group.add(rightLegGroup);
    jointsRef.current.rightLeg = rightLegGroup;

    // Pierna izquierda
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.15, 0.8, 0);
    
    const leftLegGeometry = new THREE.CylinderGeometry(
      bodyThickness * 0.45,
      bodyThickness * 0.35,
      0.7 * legLength,
      16
    );
    const leftLeg = new THREE.Mesh(leftLegGeometry, material);
    leftLeg.position.y = -0.35 * legLength;
    leftLeg.castShadow = true;
    leftLegGroup.add(leftLeg);
    
    group.add(leftLegGroup);
    jointsRef.current.leftLeg = leftLegGroup;

    stickmanRef.current = group;
    scene.add(group);
  };

  // Actualizar articulaciones
  const updateJoints = useCallback((angles: Partial<JointAngles>) => {
    const updatedAngles = { ...jointAngles, ...angles };
    setJointAngles(updatedAngles);

    if (jointsRef.current.rightArm) {
      jointsRef.current.rightArm.rotation.x = updatedAngles.rightArmX;
      jointsRef.current.rightArm.rotation.z = updatedAngles.rightArmZ;
    }
    if (jointsRef.current.leftArm) {
      jointsRef.current.leftArm.rotation.x = updatedAngles.leftArmX;
      jointsRef.current.leftArm.rotation.z = updatedAngles.leftArmZ;
    }
    if (jointsRef.current.rightLeg) {
      jointsRef.current.rightLeg.rotation.x = updatedAngles.rightLegX;
    }
    if (jointsRef.current.leftLeg) {
      jointsRef.current.leftLeg.rotation.x = updatedAngles.leftLegX;
    }
  }, [jointAngles]);

  // Actualizar color del stickman
  useEffect(() => {
    if (stickmanRef.current) {
      stickmanRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.color.set(stickmanColor);
        }
      });
    }
  }, [stickmanColor]);

  // Actualizar zoom de cámara
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 1.5, cameraZoom);
    }
  }, [cameraZoom]);

  // Iniciar grabación
  const startRecording = async () => {
    if (!rendererRef.current) return;

    setIsRecording(true);
    recordedChunksRef.current = [];
    setRecordingProgress(0);

    const stream = rendererRef.current.domElement.captureStream(videoFps);
    const mimeType = videoFormat === 'webm' ? 'video/webm;codecs=vp9' : 'video/mp4';
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: videoQuality === 'high' ? 8000000 : videoQuality === 'medium' ? 4000000 : 2000000,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;

    // Temporizador de progreso
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / videoDuration) * 100, 100);
      setRecordingProgress(progress);

      if (elapsed >= videoDuration) {
        clearInterval(progressInterval);
        stopRecording();
      }
    }, 100);
  };

  // Detener grabación
  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    mediaRecorderRef.current.stop();
    setIsRecording(false);

    setTimeout(() => {
      const blob = new Blob(recordedChunksRef.current, {
        type: videoFormat === 'webm' ? 'video/webm' : 'video/mp4',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stickman-animation-${Date.now()}.${videoFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    }, 100);
  };

  // Capturar screenshot
  const takeScreenshot = () => {
    if (!rendererRef.current) return;
    
    rendererRef.current.render(sceneRef.current!, cameraRef.current!);
    const dataURL = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `stickman-screenshot-${Date.now()}.png`;
    a.click();
  };

  // Resetear cámara
  const resetCamera = () => {
    setCameraZoom(8);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 1.5, 8);
      controlsRef.current?.reset();
    }
  };

  // Resetear articulaciones
  const resetJoints = () => {
    const defaultAngles: JointAngles = {
      rightArmX: 0,
      rightArmZ: 0,
      leftArmX: 0,
      leftArmZ: 0,
      rightLegX: 0,
      leftLegX: 0,
      headTilt: 0,
    };
    setJointAngles(defaultAngles);
    updateJoints(defaultAngles);
  };

  // Alternar play/pause
  const toggleAnimation = () => {
    setIsPlaying(!isPlaying);
  };

  // Reproducir animación
  const playAnimation = (animationName: string) => {
    setCurrentAnimation(animationName);
    setIsPlaying(true);
  };

  return (
    <div className="container">
      <div className="sidebar">
        <h1>🎬 StickMan 3D Animator Pro</h1>
        
        <div className="tab-container">
          <button 
            className={`tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            Apariencia
          </button>
          <button 
            className={`tab ${activeTab === 'animation' ? 'active' : ''}`}
            onClick={() => setActiveTab('animation')}
          >
            Animación
          </button>
          <button 
            className={`tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Exportar
          </button>
        </div>

        {/* Pestaña Apariencia */}
        {activeTab === 'appearance' && (
          <div className="tab-content active">
            <div className="control-group">
              <h2>🎨 Color del StickMan</h2>
              <label>Color Principal:</label>
              <input 
                type="color" 
                value={stickmanColor}
                onChange={(e) => setStickmanColor(e.target.value)}
              />
            </div>

            <div className="control-group">
              <h2>📐 Proporciones</h2>
              <label>Altura de la Cabeza</label>
              <input 
                type="range" 
                min="0.5" 
                max="2" 
                step="0.1" 
                value={headSize}
                onChange={(e) => setHeadSize(parseFloat(e.target.value))}
              />
              <div className="value-display">{headSize.toFixed(1)}</div>

              <label>Grosor del Cuerpo</label>
              <input 
                type="range" 
                min="0.05" 
                max="0.3" 
                step="0.01" 
                value={bodyThickness}
                onChange={(e) => setBodyThickness(parseFloat(e.target.value))}
              />
              <div className="value-display">{bodyThickness.toFixed(2)}</div>

              <label>Longitud de Brazos</label>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1" 
                value={armLength}
                onChange={(e) => setArmLength(parseFloat(e.target.value))}
              />
              <div className="value-display">{armLength.toFixed(1)}</div>

              <label>Longitud de Piernas</label>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1" 
                value={legLength}
                onChange={(e) => setLegLength(parseFloat(e.target.value))}
              />
              <div className="value-display">{legLength.toFixed(1)}</div>
            </div>

            <div className="control-group">
              <h2>👁️ Cámara</h2>
              <label>Zoom</label>
              <input 
                type="range" 
                min="2" 
                max="20" 
                step="0.5" 
                value={cameraZoom}
                onChange={(e) => setCameraZoom(parseFloat(e.target.value))}
              />
              <div className="value-display">{cameraZoom.toFixed(1)}</div>

              <button className="btn-primary" onClick={resetCamera}>
                Resetear Cámara
              </button>
            </div>
          </div>
        )}

        {/* Pestaña Animación */}
        {activeTab === 'animation' && (
          <div className="tab-content active">
            <div className="control-group">
              <h2>🎭 Animaciones Predefinidas</h2>
              <div className="animation-presets">
                {Object.keys(animationPresets).map((anim) => (
                  <button
                    key={anim}
                    className={`preset-btn ${currentAnimation === anim ? 'active' : ''}`}
                    onClick={() => playAnimation(anim)}
                  >
                    {anim.charAt(0).toUpperCase() + anim.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <h2>⚙️ Control de Animación</h2>
              <label>Velocidad de Animación</label>
              <input 
                type="range" 
                min="0.1" 
                max="3" 
                step="0.1" 
                value={animationSpeed}
                onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
              />
              <div className="value-display">{animationSpeed.toFixed(1)}</div>

              <label>Estado de la Animación</label>
              <select 
                value={isPlaying ? 'playing' : 'paused'}
                onChange={(e) => setIsPlaying(e.target.value === 'playing')}
              >
                <option value="playing">Reproduciendo</option>
                <option value="paused">Pausado</option>
              </select>

              <button className="btn-warning" onClick={toggleAnimation}>
                {isPlaying ? '⏸️ Pause' : '▶️ Play'}
              </button>
            </div>

            <div className="control-group">
              <h2>🎛️ Control Manual de Articulación</h2>
              <label>Brazo Derecho (X)</label>
              <input 
                type="range" 
                min="-3.14" 
                max="3.14" 
                step="0.1" 
                value={jointAngles.rightArmX}
                onChange={(e) => updateJoints({ rightArmX: parseFloat(e.target.value) })}
              />
              <div className="value-display">{jointAngles.rightArmX.toFixed(2)}</div>

              <label>Brazo Derecho (Z)</label>
              <input 
                type="range" 
                min="-3.14" 
                max="3.14" 
                step="0.1" 
                value={jointAngles.rightArmZ}
                onChange={(e) => updateJoints({ rightArmZ: parseFloat(e.target.value) })}
              />
              <div className="value-display">{jointAngles.rightArmZ.toFixed(2)}</div>

              <label>Brazo Izquierdo (X)</label>
              <input 
                type="range" 
                min="-3.14" 
                max="3.14" 
                step="0.1" 
                value={jointAngles.leftArmX}
                onChange={(e) => updateJoints({ leftArmX: parseFloat(e.target.value) })}
              />
              <div className="value-display">{jointAngles.leftArmX.toFixed(2)}</div>

              <label>Pierna Derecha (X)</label>
              <input 
                type="range" 
                min="-3.14" 
                max="3.14" 
                step="0.1" 
                value={jointAngles.rightLegX}
                onChange={(e) => updateJoints({ rightLegX: parseFloat(e.target.value) })}
              />
              <div className="value-display">{jointAngles.rightLegX.toFixed(2)}</div>

              <label>Pierna Izquierda (X)</label>
              <input 
                type="range" 
                min="-3.14" 
                max="3.14" 
                step="0.1" 
                value={jointAngles.leftLegX}
                onChange={(e) => updateJoints({ leftLegX: parseFloat(e.target.value) })}
              />
              <div className="value-display">{jointAngles.leftLegX.toFixed(2)}</div>

              <button className="btn-danger" onClick={resetJoints}>
                Resetear Articulaciones
              </button>
            </div>
          </div>
        )}

        {/* Pestaña Exportar */}
        {activeTab === 'export' && (
          <div className="tab-content active">
            <div className="control-group">
              <h2>📹 Configuración de Video</h2>
              <label>Formato de Video</label>
              <select value={videoFormat} onChange={(e) => setVideoFormat(e.target.value)}>
                <option value="webm">WebM (Recomendado)</option>
                <option value="mp4">MP4</option>
              </select>

              <label>Calidad</label>
              <select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value)}>
                <option value="high">Alta (1080p)</option>
                <option value="medium">Media (720p)</option>
                <option value="low">Baja (480p)</option>
              </select>

              <label>FPS (Frames por Segundo)</label>
              <select value={videoFps.toString()} onChange={(e) => setVideoFps(parseInt(e.target.value))}>
                <option value="24">24 FPS (Cine)</option>
                <option value="30">30 FPS (Estándar)</option>
                <option value="60">60 FPS (Suave)</option>
              </select>

              <label>Duración (segundos)</label>
              <input 
                type="range" 
                min="1" 
                max="30" 
                step="1" 
                value={videoDuration}
                onChange={(e) => setVideoDuration(parseInt(e.target.value))}
              />
              <div className="value-display">{videoDuration} segundos</div>
            </div>

            <div className="control-group">
              <h2>💾 Exportar</h2>
              {!isRecording ? (
                <button className="btn-success" onClick={startRecording}>
                  🔴 Iniciar Grabación
                </button>
              ) : (
                <button className="btn-danger" onClick={stopRecording}>
                  ⏹️ Detener y Guardar
                </button>
              )}
              
              {isRecording && (
                <>
                  <div className="timeline">
                    <div 
                      className="timeline-marker" 
                      style={{ left: `${recordingProgress}%` }}
                    />
                  </div>
                  <p className="joint-info">Grabando... {recordingProgress.toFixed(0)}%</p>
                </>
              )}
            </div>

            <div className="control-group">
              <h2>📸 Capturas</h2>
              <button className="btn-primary" onClick={takeScreenshot}>
                📷 Capturar Pantalla
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        <div ref={mountRef} id="canvas-container" />
        {isRecording && (
          <div className="recording-indicator">
            ● GRABANDO
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
