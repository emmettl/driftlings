import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { AttractScene } from './components/AttractScene'
import { Hud } from './ui/Hud'
import { Title } from './ui/Title'
import { useGame } from './store'

export default function App() {
  const phase = useGame((s) => s.phase)
  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ fov: 45, near: 0.1, far: 500 }}
        shadows
      >
        {phase === 'attract' ? <AttractScene /> : <Scene />}
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.3} luminanceSmoothing={0.9} />
        </EffectComposer>
      </Canvas>
      {phase === 'attract' ? <Title /> : <Hud />}
    </div>
  )
}
