import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Color, PieceSymbol, Square } from 'chess.js'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { diffMoves, type FenDiff } from '../utils/fenDiff'

/** How long a piece glides between squares (ms). */
const MOVE_ANIMATION_MS = 340
/** How long a captured piece fades away (ms). */
const CAPTURE_ANIMATION_MS = 300

interface MoveAnimation {
  mesh: THREE.Group
  from: THREE.Vector3
  to: THREE.Vector3
  /** Peak height of the hop above the board (0 for a plain slide). */
  arc: number
  start: number
  duration: number
}

interface CaptureAnimation {
  mesh: THREE.Group
  start: number
  duration: number
}

const FILES = 'abcdefgh'
const LIGHT_SQUARE = 0xf0d9b5
const DARK_SQUARE = 0xb58863
const DARK_LIGHT_SQUARE = 0x5a6e7c
const DARK_DARK_SQUARE = 0x2c3e50
const DARK_BORDER = 0x2c3e50
const BORDER = 0x412a1e
const WHITE_PIECE = 0xfffaee
const BLACK_PIECE = 0x1a1a1a
const SELECTED_TINT = 0x2196f3
const LAST_MOVE_TINT = 0xf4d03f
const CHECK_TINT = 0xe74c3c
const CAMERA_HEIGHT = 8
const CAMERA_DISTANCE = 8

type SquareMesh = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>

interface SceneHandles {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  squares: Map<Square, SquareMesh>
  pieces: THREE.Group
  markers: THREE.Group
  /** The walnut/slate border slab — kept separately so theming can repaint it. */
  border: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
}

/** Base colours for a square under the active theme. */
function squareBaseColors(darkMode: boolean): [number, number] {
  return darkMode ? [DARK_LIGHT_SQUARE, DARK_DARK_SQUARE] : [LIGHT_SQUARE, DARK_SQUARE]
}

/**
 * 3D Chess Board Component
 * Renders the board with Three.js. Click a square (or piece) to select or move,
 * drag to orbit the camera.
 */
export const ChessBoard3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  const handlesRef = useRef<SceneHandles | null>(null)
  const prevFenRef = useRef('')
  const moveAnimationsRef = useRef<MoveAnimation[]>([])
  const captureAnimationsRef = useRef<CaptureAnimation[]>([])

  const { fen, selectedSquare, legalMoves, lastMove, checkSquare } = useGameStore()
  const { boardOrientation, showLegalMoves, highlightLastMove, highlightCheck, darkMode } = useUIStore()
  const flipped = boardOrientation.flipped

  // Build the scene once. Declared first so the effects below find it on mount.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handles = createScene(container, darkMode)
    handlesRef.current = handles
    const { renderer, camera, controls, scene } = handles

    // Click-to-select, ignoring drags used to orbit the camera
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerDown: { x: number; y: number } | null = null

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY }
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
      pointerDown = null
      if (moved > 6) return

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(pointer, camera)
      const targets: THREE.Object3D[] = [...Array.from(handles.squares.values()), handles.pieces]
      const hit = raycaster.intersectObjects(targets, true)[0]
      if (!hit) return

      let object: THREE.Object3D | null = hit.object
      while (object && !object.userData.square) object = object.parent
      if (object) useGameStore.getState().selectSquare(object.userData.square as Square)
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    // Advance the move / capture animations (registered when the position changes).
    const tickAnimations = () => {
      const now = performance.now()
      const moveAnims = moveAnimationsRef.current
      if (moveAnims.length) {
        moveAnimationsRef.current = moveAnims.filter((anim) => {
          const t = Math.min(1, (now - anim.start) / anim.duration)
          const ease = 1 - (1 - t) * (1 - t) // ease-out quad
          anim.mesh.position.set(
            anim.from.x + (anim.to.x - anim.from.x) * ease,
            anim.arc * Math.sin(Math.PI * t), // hop: rise then settle
            anim.from.z + (anim.to.z - anim.from.z) * ease,
          )
          return t < 1
        })
      }
      const captureAnims = captureAnimationsRef.current
      if (captureAnims.length) {
        captureAnimationsRef.current = captureAnims.filter((anim) => {
          const t = Math.min(1, (now - anim.start) / anim.duration)
          const ease = 1 - (1 - t) * (1 - t) // ease-out quad
          anim.mesh.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            for (const material of materials) material.opacity = 1 - ease
          })
          return t < 1
        })
      }
    }

    // Render loop
    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      tickAnimations()
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Keep the canvas matched to its container
    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    })
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      disposeChildren(handles.pieces)
      disposeChildren(handles.markers)
      handles.squares.forEach((mesh) => mesh.material.dispose())
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      handlesRef.current = null
    }
  }, [])

  // Keep the pieces in sync with the position, animating any moves in between.
  useEffect(() => {
    const handles = handlesRef.current
    if (!handles) return
    const prev = prevFenRef.current
    prevFenRef.current = fen
    const diff = diffMoves(prev, fen)
    // Animate a single move (or a castling's two glides); larger jumps — e.g.
    // starting a new game from a mid-game position — snap into place instead.
    const animated = diff.moves.length <= 2 ? diff : { moves: [], captures: [] }
    syncPieces(handles, fen, animated, {
      registerMove(mesh, from, to) {
        const [fx, fz] = squareToWorld(from)
        const [tx, tz] = squareToWorld(to)
        const distance = Math.hypot(tx - fx, tz - fz)
        moveAnimationsRef.current.push({
          mesh,
          from: new THREE.Vector3(fx, 0, fz),
          to: new THREE.Vector3(tx, 0, tz),
          // Long and leaping moves (knight, castling) take a little hop.
          arc: distance > 1.8 ? 0.35 : 0,
          start: performance.now(),
          duration: MOVE_ANIMATION_MS,
        })
      },
      registerCapture(mesh) {
        captureAnimationsRef.current.push({ mesh, start: performance.now(), duration: CAPTURE_ANIMATION_MS })
      },
    })
  }, [fen])

  // Highlights: selection, legal moves, last move and check
  useEffect(() => {
    const handles = handlesRef.current
    if (!handles) return
    syncHighlights(handles, {
      selectedSquare,
      legalMoves: showLegalMoves ? legalMoves : [],
      lastMove: highlightLastMove ? lastMove : null,
      checkSquare: highlightCheck ? checkSquare : null,
      darkMode,
    })
  }, [selectedSquare, legalMoves, lastMove, checkSquare, showLegalMoves, highlightLastMove, highlightCheck, darkMode])

  // View the board from the chosen side
  useEffect(() => {
    const handles = handlesRef.current
    if (!handles) return
    handles.camera.position.set(0, CAMERA_HEIGHT, flipped ? -CAMERA_DISTANCE : CAMERA_DISTANCE)
    handles.controls.update()
  }, [flipped])

  // Update dark mode when it changes
  useEffect(() => {
    const handles = handlesRef.current
    if (!handles) return
    syncDarkMode(handles, darkMode)
  }, [darkMode])



  return <div ref={containerRef} className="aspect-square w-[min(92vw,58vh)] overflow-hidden rounded-lg xl:w-[min(92vw,68vh,720px)]" />
}

/** World x/z for the centre of a square. White's first rank is nearest the default camera. */
function squareToWorld(square: Square): [number, number] {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  return [file - 3.5, 3.5 - rank]
}

function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  return (file + rank) % 2 === 1
}

function createScene(container: HTMLDivElement, darkMode: boolean): SceneHandles {
  const width = Math.max(container.clientWidth, 1)
  const height = Math.max(container.clientHeight, 1)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(darkMode ? 0x1a1a2e : 0xf3ead8)

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 5
  controls.maxDistance = 20
  controls.maxPolarAngle = Math.PI / 2.2
  controls.target.set(0, 0, 0)

  // Board
  const board = new THREE.Group()
  const squares = new Map<Square, SquareMesh>()
  const squareGeometry = new THREE.BoxGeometry(1, 0.1, 1)
  for (let file = 0; file < 8; file++) {
    for (let rank = 1; rank <= 8; rank++) {
      const square = `${FILES[file]}${rank}` as Square
      const [light, dark] = squareBaseColors(darkMode)
      const squareColor = isLightSquare(square) ? light : dark
      const material = new THREE.MeshStandardMaterial({
        color: squareColor,
        roughness: 0.75,
      })
      const mesh: SquareMesh = new THREE.Mesh(squareGeometry, material)
      const [x, z] = squareToWorld(square)
      mesh.position.set(x, -0.05, z)
      mesh.receiveShadow = true
      mesh.userData.square = square
      board.add(mesh)
      squares.set(square, mesh)
    }
  }

  const border = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.16, 8.6),
    new THREE.MeshStandardMaterial({ color: darkMode ? DARK_BORDER : BORDER, roughness: 0.65 }),
  )
  border.position.y = -0.09
  border.receiveShadow = true
  board.add(border)
  scene.add(board)

  const pieces = new THREE.Group()
  const markers = new THREE.Group()
  scene.add(pieces, markers)

  // Lighting
  if (darkMode) {
    // Dark mode: brighter, cooler lighting for better black piece visibility
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const sun = new THREE.DirectionalLight(0xffffff, 1.8)
    sun.position.set(5, 12, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.5)
    fill.position.set(-6, 8, -4)
    scene.add(fill)
    const rim = new THREE.PointLight(0xaaccff, 1.0, 30)
    rim.position.set(-4, 3, -6)
    scene.add(rim)
  } else {
    // Light mode: original warm candlelight
    scene.add(new THREE.AmbientLight(0xfff2d8, 0.4))
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.4)
    sun.position.set(5, 12, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x9db8d8, 0.35)
    fill.position.set(-6, 8, -4)
    scene.add(fill)
    const rim = new THREE.PointLight(0xd4a542, 0.7, 30)
    rim.position.set(-4, 3, -6)
    scene.add(rim)
  }

  // Expose scene for theme updates
  return { scene, camera, renderer, controls, squares, pieces, markers, border }
}

/** Extra work performed when a piece is recreated for the new position. */
interface PieceSyncCallbacks {
  /** Called for a piece that arrived from another square — register its glide. */
  registerMove(mesh: THREE.Group, from: Square, to: Square): void
  /** Called for a freshly created "ghost" of a captured piece — register its fade. */
  registerCapture(mesh: THREE.Group): void
}

/**
 * Rebuild the piece meshes from the FEN piece placement. Pieces that moved in
 * the given diff glide in from their old squares; captured pieces leave a
 * fading ghost on their last square.
 */
function syncPieces(handles: SceneHandles, fen: string, diff: FenDiff, callbacks: PieceSyncCallbacks) {
  disposeChildren(handles.pieces)

  const moves = new Map(diff.moves.map((move) => [move.to, move]))

  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
        continue
      }
      const color: Color = char === char.toUpperCase() ? 'w' : 'b'
      const type = char.toLowerCase() as PieceSymbol
      const square = `${FILES[file]}${rank}` as Square

      const piece = buildPiece(type, color)
      const [x, z] = squareToWorld(square)
      piece.position.set(x, 0, z)
      if (color === 'b') piece.rotation.y = Math.PI
      piece.userData.square = square
      handles.pieces.add(piece)
      const move = moves.get(square)
      if (move) callbacks.registerMove(piece, move.from, square)
      file++
    }
  })

  for (const capture of diff.captures) {
    const color: Color = capture.piece === capture.piece.toUpperCase() ? 'w' : 'b'
    const ghost = buildPiece(capture.piece.toLowerCase() as PieceSymbol, color)
    const [x, z] = squareToWorld(capture.square)
    ghost.position.set(x, 0, z)
    if (color === 'b') ghost.rotation.y = Math.PI
    ghost.userData.square = capture.square
    ghost.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        material.transparent = true
      })
    })
    handles.pieces.add(ghost)
    callbacks.registerCapture(ghost)
  }
}

/**
 * Stylised pieces, each built from primitives into a clearly distinct
 * silhouette AND height so they can be told apart at a glance:
 * pawn ~0.8 < rook ~1.0 < knight ~1.15 < bishop ~1.35 < queen ~1.55 < king ~1.75.
 */
function buildPiece(type: PieceSymbol, color: Color): THREE.Group {
  const material = new THREE.MeshStandardMaterial({
    color: color === 'w' ? WHITE_PIECE : BLACK_PIECE,
    roughness: 0.3,
    metalness: 0.15,
  })
  const group = new THREE.Group()

  /** Add a mesh whose CENTRE sits at (x, y, z), optionally tilted about X. */
  const mesh = (
    geometry: THREE.BufferGeometry,
    y: number,
    opts: { x?: number; z?: number; rx?: number } = {},
  ) => {
    const m = new THREE.Mesh(geometry, material)
    m.position.set(opts.x ?? 0, y, opts.z ?? 0)
    if (opts.rx) m.rotation.x = opts.rx
    m.castShadow = true
    group.add(m)
    return m
  }
  const cyl = (top: number, bottom: number, h: number, segments = 32) =>
    new THREE.CylinderGeometry(top, bottom, h, segments)
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
  const sphere = (r: number) => new THREE.SphereGeometry(r, 24, 18)
  /** Flat-lying torus, used as a collar ring around a piece. */
  const ring = (r: number, tube: number, y: number) =>
    mesh(new THREE.TorusGeometry(r, tube, 12, 32), y, { rx: Math.PI / 2 })

  // Stepped base shared by every piece.
  mesh(cyl(0.34, 0.42, 0.1), 0.05)
  mesh(cyl(0.27, 0.34, 0.07), 0.135)

  switch (type) {
    case 'p': {
      // Pawn (~0.82): by far the shortest — slim waist, small ball head.
      mesh(cyl(0.12, 0.22, 0.3), 0.32)
      ring(0.15, 0.04, 0.49)
      mesh(sphere(0.15), 0.66)
      break
    }
    case 'r': {
      // Rook (~1.02): flat-topped tower with square crenellations.
      mesh(cyl(0.21, 0.27, 0.52), 0.42)
      mesh(cyl(0.3, 0.24, 0.14), 0.75)
      ring(0.24, 0.035, 0.84)
      for (const dx of [-1, 1]) {
        for (const dz of [-1, 1]) {
          mesh(box(0.13, 0.2, 0.13), 0.92, { x: dx * 0.2, z: dz * 0.2 })
        }
      }
      break
    }
    case 'n': {
      // Knight (~1.15): horse head leaning forward, with muzzle, ears and mane.
      mesh(cyl(0.19, 0.26, 0.22), 0.28)
      mesh(box(0.18, 0.5, 0.24), 0.6, { z: 0.02, rx: -0.35 }) // neck
      mesh(box(0.16, 0.18, 0.44), 0.95, { z: -0.16, rx: -0.15 }) // head
      mesh(box(0.13, 0.12, 0.18), 0.9, { z: -0.45 }) // muzzle
      mesh(box(0.07, 0.3, 0.2), 0.82, { z: 0.12, rx: -0.35 }) // mane
      mesh(new THREE.ConeGeometry(0.045, 0.14, 12), 1.08, { x: -0.055, z: 0.02 }) // ears
      mesh(new THREE.ConeGeometry(0.045, 0.14, 12), 1.08, { x: 0.055, z: 0.02 })
      break
    }
    case 'b': {
      // Bishop (~1.35): smooth tall mitre with a collar and ball finial.
      mesh(cyl(0.15, 0.25, 0.56), 0.45)
      ring(0.19, 0.05, 0.76)
      mesh(new THREE.ConeGeometry(0.19, 0.5, 24), 1.01) // mitre
      mesh(sphere(0.07), 1.28) // finial
      break
    }
    case 'q': {
      // Queen (~1.55): coronet of five spikes around a centre orb.
      mesh(cyl(0.16, 0.28, 0.85), 0.615)
      ring(0.21, 0.05, 1.07)
      mesh(cyl(0.24, 0.19, 0.16), 1.17) // crown band
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2
        mesh(new THREE.ConeGeometry(0.055, 0.2, 12), 1.36, {
          x: Math.cos(angle) * 0.19,
          z: Math.sin(angle) * 0.19,
        })
      }
      mesh(sphere(0.1), 1.44)
      break
    }
    case 'k': {
      // King (~1.75): tallest, wide crown band topped by a bold cross.
      mesh(cyl(0.16, 0.28, 0.95), 0.665)
      ring(0.21, 0.05, 1.16)
      mesh(cyl(0.23, 0.2, 0.18), 1.25) // crown band
      mesh(box(0.09, 0.4, 0.09), 1.54) // cross upright
      mesh(box(0.3, 0.09, 0.09), 1.6) // cross arm
      break
    }
  }

  return group
}

const MARKER_GEOMETRY = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20)
const CAPTURE_MARKER_GEOMETRY = new THREE.TorusGeometry(0.4, 0.05, 8, 32)

function syncHighlights(
  handles: SceneHandles,
  state: {
    selectedSquare: Square | null
    legalMoves: Square[]
    lastMove: { from: Square; to: Square } | null
    checkSquare: Square | null
    darkMode: boolean
  },
) {
  const { selectedSquare, legalMoves, lastMove, checkSquare, darkMode } = state
  const tint = new THREE.Color()
  const [light, dark] = squareBaseColors(darkMode)

  handles.squares.forEach((mesh, square) => {
    const isLight = isLightSquare(square)
    const baseColor = new THREE.Color(isLight ? light : dark)
    let color = baseColor
    
    if (lastMove && (lastMove.from === square || lastMove.to === square)) {
      color = baseColor.clone().lerp(tint.set(LAST_MOVE_TINT), 0.6)
    }
    if (square === selectedSquare) {
      color = baseColor.clone().lerp(tint.set(SELECTED_TINT), 0.7)
    }
    if (square === checkSquare) {
      color = baseColor.clone().lerp(tint.set(CHECK_TINT), 0.8)
    }
    mesh.material.color.copy(color)
  })

  disposeChildren(handles.markers)
  const occupied = new Set<string>(handles.pieces.children.map((piece) => piece.userData.square as string))
  for (const square of legalMoves) {
    const isCapture = occupied.has(square)
    const marker = new THREE.Mesh(
      isCapture ? CAPTURE_MARKER_GEOMETRY : MARKER_GEOMETRY,
      new THREE.MeshStandardMaterial({ color: SELECTED_TINT, transparent: true, opacity: 0.75 }),
    )
    marker.userData.sharedGeometry = true
    const [x, z] = squareToWorld(square)
    marker.position.set(x, 0.03, z)
    if (isCapture) marker.rotation.x = Math.PI / 2
    handles.markers.add(marker)
  }
}

function syncDarkMode(handles: SceneHandles, darkMode: boolean) {
  // Square repaint is handled by syncHighlights (theme-aware now); here we
  // take care of the border slab and the scene backdrop.
  handles.border.material.color.setHex(darkMode ? DARK_BORDER : BORDER)
  if (handles.scene.background instanceof THREE.Color) {
    handles.scene.background.setHex(darkMode ? 0x1a1a2e : 0xf3ead8)
  }
}

/** Remove and dispose everything inside a group. */
function disposeChildren(group: THREE.Group) {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      if (!object.userData.sharedGeometry) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    group.remove(child)
  }
}
