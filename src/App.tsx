import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { Hud } from './ui/Hud'

export default function App() {
  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 45, near: 0.1, far: 500 }}
        shadows
      >
        <Scene />
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.3} luminanceSmoothing={0.9} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </div>
  )
}
