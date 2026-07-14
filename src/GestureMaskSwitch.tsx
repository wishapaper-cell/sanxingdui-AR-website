import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function GestureMaskSwitch() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('初始化中...');
  const [fps, setFps] = useState(0);
  const [gesture, setGesture] = useState('无');
  const [maskVisible, setMaskVisible] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastFrameTimeRef = useRef(0);
  const videoReadyRef = useRef(false);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const maskModelRef = useRef<THREE.Group | null>(null);
  const textureRefs = useRef<THREE.Texture[]>([]);

  // 挥手检测状态
  const lastHandXRef = useRef(0);
  const gestureStateRef = useRef<'IDLE' | 'TRACKING' | 'COOLDOWN'>('IDLE');
  const lastSwitchTimeRef = useRef(0);
  const lastDirectionRef = useRef<'left' | 'right' | null>(null);
  const modelReadyRef = useRef(false);

  useEffect(() => {
    let animationId: number;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        setStatus('加载 MediaPipe 模型...');

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
        });

        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2
        });

        setStatus('初始化 Three.js 场景...');

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
        camera.position.z = 1;
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setClearColor(0x000000, 0);
        rendererRef.current = renderer;

        // 光源
        scene.add(new THREE.AmbientLight(0xffffff, 1.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(0, 1, 3);
        scene.add(dirLight);

        // 加载 GLB 模型 - 使用 fetch + parse，手动管理 blob URL 生命周期
        setStatus('加载面具模型...');
        const loader = new GLTFLoader();
        const glbRes = await fetch('/5b81d915043f2d52feb2c2024fbfcb6a.glb');
        const glbBuffer = await glbRes.arrayBuffer();

        // 保存 blob URL 引用，防止被回收
        const blobUrls: string[] = [];
        const originalCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = function(blob: Blob) {
          const url = originalCreateObjectURL.call(URL, blob);
          blobUrls.push(url);
          return url;
        };

        try {
          loader.parse(glbBuffer, '', (gltf) => {
            // 恢复原始方法
            URL.createObjectURL = originalCreateObjectURL;

            const model = gltf.scene;

            // 保持纹理引用
            const textures: THREE.Texture[] = [];
            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                  mats.forEach(mat => {
                    const m = mat as THREE.MeshStandardMaterial;
                    if (m.map) textures.push(m.map);
                    if (m.normalMap) textures.push(m.normalMap);
                    if (m.roughnessMap) textures.push(m.roughnessMap);
                    if (m.metalnessMap) textures.push(m.metalnessMap);
                  });
                }
              }
            });
            textureRefs.current = textures;

            // 自动计算模型包围盒，居中并缩放
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const targetSize = 0.5;
            const s = targetSize / maxDim;
            model.scale.set(s, s, s);
            model.position.set(-center.x * s, -center.y * s, -center.z * s);

            // 调整模型朝向：让面具正面面向摄像头，顶部朝上
            // 只绕Y轴旋转180度让正面朝向摄像头
            model.rotation.set(0, Math.PI, 0);

            scene.add(model);
            maskModelRef.current = model;
            modelReadyRef.current = true;
            setMaskVisible(true);
            setStatus('模型加载完成');
            console.log('面具模型加载成功，纹理数量:', textures.length, 'blob URLs:', blobUrls.length);
          }, (err: unknown) => {
            URL.createObjectURL = originalCreateObjectURL;
            const msg = err instanceof Error ? err.message : String(err);
            console.error('GLB 解析失败:', err);
            setStatus(`模型加载失败: ${msg}`);
          });
        } catch (err) {
          URL.createObjectURL = originalCreateObjectURL;
          throw err;
        }

        // 摄像头
        setStatus('请求摄像头权限...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise<void>(resolve => {
            if (videoRef.current) {
              videoRef.current.onloadedmetadata = () => resolve();
            }
          });
          await videoRef.current.play();
          videoReadyRef.current = true;
          setStatus('运行中 - 张开手掌挥过脸部切换面具');
          detect();
        }
      } catch (err) {
        console.error(err);
        setStatus(`错误: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const detect = () => {
      const detectFrame = () => {
        if (!videoRef.current || !canvasRef.current || !handLandmarkerRef.current || !faceLandmarkerRef.current) {
          animationId = requestAnimationFrame(detectFrame);
          return;
        }

        // 视频未就绪时跳过检测
        if (!videoReadyRef.current || !modelReadyRef.current) {
          animationId = requestAnimationFrame(detectFrame);
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;

        // 确保视频有有效尺寸
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          animationId = requestAnimationFrame(detectFrame);
          return;
        }

        const now = performance.now();
        if (lastFrameTimeRef.current > 0) {
          const delta = now - lastFrameTimeRef.current;
          setFps(Math.round(1000 / delta));
        }
        lastFrameTimeRef.current = now;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 绘制视频帧（镜像）
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // 人脸检测
        let faceLandmarks: any[] | null = null;
        try {
          const faceResults = faceLandmarkerRef.current.detectForVideo(video, now);
          if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
            faceLandmarks = faceResults.faceLandmarks[0];
            setFaceDetected(true);

            // 更新 3D 面具位置
            updateMaskPosition(faceLandmarks, canvas.width, canvas.height);

            // 渲染 Three.js 场景并合成
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.setSize(canvas.width, canvas.height);
              cameraRef.current.aspect = canvas.width / canvas.height;
              cameraRef.current.updateProjectionMatrix();
              rendererRef.current.render(sceneRef.current, cameraRef.current);

              ctx.save();
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(rendererRef.current.domElement, 0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
          } else {
            setFaceDetected(false);
          }
        } catch (e) {
          // MediaPipe 偶尔会报 ROI 错误，忽略并继续
          setFaceDetected(false);
        }

        // 手部检测
        try {
          const handResults = handLandmarkerRef.current.detectForVideo(video, now);
          if (handResults.landmarks && handResults.landmarks.length > 0) {
            const handLandmarks = handResults.landmarks[0];
            const detectedGesture = recognizeGesture(handLandmarks);
            setGesture(detectedGesture);

            if (faceLandmarks) {
              detectHandWave(faceLandmarks, handLandmarks, now);
            }
          } else {
            setGesture('无');
            gestureStateRef.current = 'IDLE';
          }
        } catch (e) {
          setGesture('无');
        }

        animationId = requestAnimationFrame(detectFrame);
      };

      animationId = requestAnimationFrame(detectFrame);
    };

    const updateMaskPosition = (landmarks: any[], _canvasWidth: number, _canvasHeight: number) => {
      if (!maskModelRef.current || !cameraRef.current) return;

      const nose = landmarks[1];
      const leftEar = landmarks[234];
      const rightEar = landmarks[454];
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      
      // 嘴唇关键点：13(上唇)、14(下唇)、61(左嘴角)、291(右嘴角)
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const leftMouth = landmarks[61];
      const rightMouth = landmarks[291];
      
      // 计算嘴唇中心点
      const lipCenterX = (upperLip.x + lowerLip.x) / 2;
      const lipCenterY = (upperLip.y + lowerLip.y) / 2;

      // 1. 位置：嘴唇为中心，映射到 Three.js 坐标
      const lipX = (lipCenterX - 0.5) * 2;
      const lipY = -(lipCenterY - 0.5) * 2;
      maskModelRef.current.position.set(lipX * 0.8, lipY * 0.8, 0);

      // 2. 缩放：左右耳距离
      const faceWidth = rightEar.x - leftEar.x;
      const scale = faceWidth * 4;
      maskModelRef.current.scale.set(scale, scale, scale);

      // 3. 旋转
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      // 视频做了镜像翻转，yaw 和 roll 需要取反
      const yaw = -(nose.x - eyeCenterX) * Math.PI * 3;
      const pitch = -(nose.y - eyeCenterY) * Math.PI * 3;
      const roll = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
      // 添加固定偏移：X轴旋转-90度让顶部朝上，Y轴180度让正面朝向摄像头，Z轴180度修正上下颠倒
      maskModelRef.current.rotation.set(pitch - Math.PI / 2, yaw + Math.PI, roll + Math.PI);
    };

    const recognizeGesture = (landmarks: any[]): string => {
      const fingerTips = [8, 12, 16, 20];
      const fingerPIPs = [6, 10, 14, 18];

      let extendedFingers = 0;
      for (let i = 0; i < fingerTips.length; i++) {
        if (landmarks[fingerTips[i]].y < landmarks[fingerPIPs[i]].y) {
          extendedFingers++;
        }
      }

      const thumbTip = landmarks[4];
      const thumbIP = landmarks[3];
      const thumbMCP = landmarks[2];
      if (Math.abs(thumbTip.x - thumbMCP.x) > Math.abs(thumbIP.x - thumbMCP.x)) {
        extendedFingers++;
      }

      if (extendedFingers === 5) return '张开手掌';
      if (extendedFingers === 0) return '握拳';
      if (extendedFingers === 2) return '剪刀手';
      if (extendedFingers === 1) return '食指指向';
      return `${extendedFingers} 指伸展`;
    };

    const detectHandWave = (faceLandmarks: any[], handLandmarks: any[], now: number) => {
      const handCenterX = handLandmarks[9].x;
      const velocity = handCenterX - lastHandXRef.current;
      lastHandXRef.current = handCenterX;

      const leftEar = faceLandmarks[234];
      const rightEar = faceLandmarks[454];
      const faceCenterX = (leftEar.x + rightEar.x) / 2;
      const faceWidth = rightEar.x - leftEar.x;
      const triggerThreshold = faceWidth * 0.3;

      const isOpenHand = recognizeGesture(handLandmarks) === '张开手掌';
      const isMoving = Math.abs(velocity) > 0.005;
      const crossedCenterRight = handCenterX > faceCenterX + triggerThreshold;
      const crossedCenterLeft = handCenterX < faceCenterX - triggerThreshold;
      const crossedCenter = crossedCenterRight || crossedCenterLeft;

      if (gestureStateRef.current === 'IDLE') {
        if (isOpenHand && isMoving) {
          gestureStateRef.current = 'TRACKING';
        }
      } else if (gestureStateRef.current === 'TRACKING') {
        if (crossedCenter && now - lastSwitchTimeRef.current > 1000) {
          const direction = velocity > 0 ? 'right' : 'left';
          if (lastDirectionRef.current !== direction) {
            triggerMaskSwitch();
            lastSwitchTimeRef.current = now;
            lastDirectionRef.current = direction;
            gestureStateRef.current = 'COOLDOWN';
          }
        }
        if (!isOpenHand || !isMoving) {
          gestureStateRef.current = 'IDLE';
        }
      } else if (gestureStateRef.current === 'COOLDOWN') {
        if (now - lastSwitchTimeRef.current > 1000) {
          gestureStateRef.current = 'IDLE';
        }
      }
    };

    const triggerMaskSwitch = () => {
      console.log('触发面具切换！');
      if (maskModelRef.current) {
        const originalScale = maskModelRef.current.scale.clone();
        maskModelRef.current.scale.multiplyScalar(1.3);
        setTimeout(() => {
          if (maskModelRef.current) {
            maskModelRef.current.scale.copy(originalScale);
          }
        }, 200);
      }
    };

    init();

    return () => {
      cancelAnimationFrame(animationId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  return (
    <div style={{
      padding: 20,
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <h1 style={{
        color: '#c8a96e',
        marginBottom: 10,
        fontSize: 32,
        textShadow: '0 0 20px rgba(200, 169, 110, 0.5)'
      }}>
        三星堆 3D 面具 AR 体验
      </h1>

      <div style={{
        marginBottom: 20,
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <div style={{ padding: '10px 20px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 8 }}>
          <span style={{ color: '#4ade80' }}>状态: {status}</span>
        </div>
        {fps > 0 && (
          <div style={{ padding: '10px 20px', background: 'rgba(96, 165, 250, 0.1)', border: '1px solid rgba(96, 165, 250, 0.3)', borderRadius: 8 }}>
            <span style={{ color: '#60a5fa' }}>FPS: {fps}</span>
          </div>
        )}
        <div style={{ padding: '10px 20px', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: 8 }}>
          <span style={{ color: '#fbbf24', fontSize: 18 }}>手势: <strong>{gesture}</strong></span>
        </div>
        <div style={{ padding: '10px 20px', background: maskVisible ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 68, 68, 0.1)', border: `1px solid ${maskVisible ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`, borderRadius: 8 }}>
          <span style={{ color: maskVisible ? '#4ade80' : '#ff4444' }}>面具: {maskVisible ? '已加载' : '加载中'}</span>
        </div>
        <div style={{ padding: '10px 20px', background: faceDetected ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 68, 68, 0.1)', border: `1px solid ${faceDetected ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`, borderRadius: 8 }}>
          <span style={{ color: faceDetected ? '#4ade80' : '#ff4444' }}>人脸: {faceDetected ? '已检测' : '未检测'}</span>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'inline-block', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}>
        <video ref={videoRef} style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ border: '3px solid #333', borderRadius: 12, maxWidth: '100%', height: 'auto' }} />
      </div>

      <div style={{ marginTop: 30, color: '#888', fontSize: 14, maxWidth: 600, textAlign: 'center' }}>
        <div style={{ padding: 20, background: 'rgba(200, 169, 110, 0.1)', borderRadius: 12, border: '1px solid rgba(200, 169, 110, 0.2)' }}>
          <p style={{ color: '#c8a96e', fontWeight: 'bold', marginBottom: 10, fontSize: 16 }}>🎭 使用说明</p>
          <ul style={{ marginLeft: 20, textAlign: 'left', lineHeight: 1.8 }}>
            <li><strong style={{ color: '#4ade80' }}>张开手掌挥过脸部</strong> → 切换面具</li>
            <li><strong style={{ color: '#60a5fa' }}>面具自动贴合面部</strong> → 跟随头部移动和旋转</li>
            <li><strong style={{ color: '#fbbf24' }}>挥手方向</strong> → 从左到右或从右到左均可触发</li>
          </ul>
          <div style={{ marginTop: 15, padding: 15, background: 'rgba(255, 193, 7, 0.1)', borderRadius: 8 }}>
            <p style={{ color: '#fbbf24', fontSize: 13 }}>💡 提示：面具会根据面部特征点自动定位、缩放和旋转</p>
          </div>
        </div>
      </div>
    </div>
  );
}
