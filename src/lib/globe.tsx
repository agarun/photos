'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import GlobeGL from 'react-globe.gl';
import { GeoJsonGeometry } from 'three-geojson-geometry';
import { geoGraticule10 } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useWindowSize } from '@/hooks/use-window-size';
import albums, { types } from './albums';
import Link from 'next/link';

type Ring = {
  lat: number;
  lng: number;
  maxR: number;
  propagationSpeed: number;
  repeatPeriod: number;
};

type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: Array<string>;
};

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function useLandPolygons() {
  const [landPolygons, setLandPolygons] = useState([]);
  useEffect(() => {
    async function fetchLandPolygons() {
      const landTopo = await import('../data/land-110m.json');
      const landPolygons = topojson.feature(
        landTopo,
        landTopo.objects.land
      ).features;
      setLandPolygons(landPolygons);
    }
    fetchLandPolygons();
  }, []);
  const polygonMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.77,
    transparent: true
  });

  return { landPolygons, polygonMaterial };
}

function usePoints() {
  const [altitude, setAltitude] = useState(0.002);
  return {
    pointAltitude: altitude,
    setPointAltitude: setAltitude,
    points: albums
  };
}

function useRings(globeElRef, setPointAltitude) {
  const [activeAlbum, setActiveAlbum] = useState<typeof albums>();

  const [rings, setRings] = useState<Array<Ring>>([]);
  const colorInterpolator = t => `rgba(255,100,50,${Math.sqrt(1 - t)})`;

  const [enterTimeoutId, setEnterTimeoutId] = useState<NodeJS.Timeout>();
  function handleMouseEnter({ lat, lng, name, type }) {
    setActiveAlbum(name);

    clearTimeout(enterTimeoutId);

    const id = setTimeout(() => {
      if (type === types.LOCATION) {
        globeElRef.pointOfView(
          {
            lat,
            lng,
            altitude: 1
          },
          1000
        );

        globeElRef.controls().autoRotateForced = true;
        globeElRef.controls().autoRotateSpeed = 0.75;

        setRings([
          { lat, lng, maxR: 9, propagationSpeed: 0.88, repeatPeriod: 1777 }
        ]);
      } else if (type === types.CUSTOM) {
        setPointAltitude(2);

        globeElRef.controls().autoRotateForced = true;
        globeElRef.controls().autoRotateSpeed = 3 * DEFAULT_AUTOROTATE_SPEED;

        setRings([
          {
            lat: 90,
            lng: 0,
            maxR: 180,
            propagationSpeed: 27,
            repeatPeriod: 195
          }
        ]);
      }
    }, 0);
    setEnterTimeoutId(id);
  }
  function handleMouseLeave() {
    setPointAltitude(0.002);

    setActiveAlbum();

    globeElRef.pointOfView(
      {
        lat: 30,
        altitude: 2
      },
      1000
    );

    globeElRef.controls().autoRotateForced = false;
    globeElRef.controls().autoRotateSpeed = 1.5;

    setRings([]);
  }

  return {
    activeAlbum,
    rings,
    colorInterpolator,
    handleMouseEnter,
    handleMouseLeave
  };
}

function generateArcs() {
  const data = [];
  for (let i = 0; i < albums.length; i++) {
    for (let j = i + 1; j < albums.length; j++) {
      data.push({
        startLat: albums[i].lat,
        startLng: albums[i].lng,
        endLat: albums[j].lat,
        endLng: albums[j].lng,
        color: ['red', 'red']
      });
    }
  }
  return data;
}

function useArcs() {
  const [arcs, setArcs] = useState<Array<Arc>>([]);
  useEffect(() => {
    setArcs(generateArcs());
  }, []);

  return { arcs };
}

function useCustomLayer(globeElRef) {
  const customLayerData = [...Array(500).keys()].map(() => ({
    lat: (Math.random() - 0.5) * 180,
    lng: (Math.random() - 0.5) * 360,
    alt: Math.random() * 1.4 + 0.1
  }));
  const customThreeObject = () =>
    new THREE.Mesh(
      new THREE.SphereGeometry(0.22),
      new THREE.MeshBasicMaterial({
        color: '#777777',
        opacity: 0.25,
        transparent: true
      })
    );
  const customThreeObjectUpdate = (object, objectData) =>
    Object.assign(
      object.position,
      globeElRef?.getCoords(objectData.lat, objectData.lng, objectData.alt)
    );

  return {
    customLayerData,
    customThreeObject,
    customThreeObjectUpdate
  };
}

const DEFAULT_AUTOROTATE_SPEED = 1.75;

function Globe() {
  // object config
  const globeEl = useRef();
  const globeElRef = globeEl.current;

  const autoRotateSpeed = () => {
    if (globeElRef) {
      const { lng } = globeElRef.pointOfView();
      let newSpeed = DEFAULT_AUTOROTATE_SPEED;

      // [ [ longitude, speed multiplier ], ... ]
      const gradientSteps = [
        [165, 2],
        [160, 1.825],
        [155, 1.75],
        [150, 1.5],
        [145, 1.25],
        [-120, 2.25],
        [-110, 1.75],
        [-115, 1.5],
        [-100, 1.35],
        [-95, 1.25],
        [-90, 1.15]
      ];
      for (const [longitude, multiplier] of gradientSteps) {
        if (longitude < 0 && lng < longitude) {
          // west of california
          newSpeed = multiplier * DEFAULT_AUTOROTATE_SPEED;
          break;
        }
        if (longitude > 0 && lng > longitude) {
          // east of japan
          newSpeed = multiplier * DEFAULT_AUTOROTATE_SPEED;
          break;
        }
      }
      if (
        !globeElRef.controls().autoRotateForced &&
        newSpeed !== DEFAULT_AUTOROTATE_SPEED
      ) {
        // faster over the ocean
        globeElRef.controls().autoRotateSpeed = newSpeed;
      }
    }
    requestAnimationFrame(autoRotateSpeed);
  };

  const handleGlobeReady = () => {
    globeElRef.controls().enabled = false;

    globeElRef.controls().enableZoom = false;

    globeElRef.controls().autoRotate = true;
    globeElRef.controls().autoRotateSpeed = DEFAULT_AUTOROTATE_SPEED;

    globeElRef.pointOfView({ lat: 30, lng: -30, altitude: 2 });

    autoRotateSpeed();
  };
  // scene config
  useEffect(() => {
    if (!globeElRef) return;

    const scene = globeElRef.scene();

    const radius = 300;
    const graticules = new THREE.LineSegments(
      new GeoJsonGeometry(geoGraticule10(), radius, 2),
      new THREE.LineBasicMaterial({
        color: 'lightgrey',
        transparent: true,
        opacity: 0.47
      })
    );
    scene.add(graticules);

    const innerSphereGeometry = new THREE.SphereGeometry(
      globeElRef.getGlobeRadius() - 6,
      64,
      32
    );
    const innerSphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff /* it's neat to try different colors here */,
      opacity: 0.43,
      transparent: true
    });
    const innerSphere = new THREE.Mesh(
      innerSphereGeometry,
      innerSphereMaterial
    );
    innerSphere.renderOrder = Number.MAX_SAFE_INTEGER;
    scene.add(innerSphere);
  }, [globeElRef]);

  // land shapes
  const { landPolygons, polygonMaterial } = useLandPolygons();

  // `albums` map points
  const { points, pointAltitude, setPointAltitude } = usePoints();

  // rings animation
  const { rings, colorInterpolator, handleMouseEnter, handleMouseLeave } =
    useRings(globeElRef, setPointAltitude);

  // arcs animation
  const { arcs } = useArcs();

  // resize canvas on resize viewport
  const { width, height } = useWindowSize();

  // stars in the background
  const { customLayerData, customThreeObject, customThreeObjectUpdate } =
    useCustomLayer(globeElRef);

  return (
    <section className="globe-container">
      <GlobeGL
        ref={globeEl}
        width={width}
        height={height}
        rendererConfig={{ antialias: true }} // `false` yields much better perf
        onGlobeReady={handleGlobeReady}
        animateIn={false}
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="rgba(255, 255, 255, 1)"
        showGlobe={false}
        showAtmosphere={false}
        showGraticules={false}
        polygonsData={landPolygons}
        polygonCapMaterial={polygonMaterial}
        polygonsTransitionDuration={0}
        polygonAltitude={() => 0}
        polygonSideColor={() => 'rgba(255, 255, 255, 0)'}
        polygonStrokeColor={() => 'darkslategray'}
        pointsData={points}
        pointColor={() => 'rgba(255, 0, 0, 0.75)'}
        pointAltitude={pointAltitude}
        pointRadius={0.19}
        pointsMerge={true}
        ringsData={rings}
        ringColor={() => colorInterpolator}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        arcsData={arcs}
        arcColor={'color'}
        arcDashLength={() => randomInRange(0.06, 0.7) / 1} // the bigger the ranges, the calmer it looks
        arcDashGap={() => randomInRange(0.025, 0.4) * 10}
        arcDashAnimateTime={() => randomInRange(0.08, 0.8) * 20000 + 500}
        customLayerData={customLayerData}
        customThreeObject={customThreeObject}
        customThreeObjectUpdate={customThreeObjectUpdate}
      />

      <section
        className={`
          content-container text-3xl
          mt-48 ml-36 m-24 2xl:ml-64`}
      >
        <h1 className="font-bold my-20">Aaron Agarunov</h1>

        <ul className="flex flex-col content-start tracking-tight ">
          {albums.map(album => {
            return (
              <li
                key={album.name}
                className="max-w-fit"
                onMouseEnter={() => {
                  handleMouseEnter(album);
                }}
                onMouseLeave={() => {
                  handleMouseLeave();
                }}
              >
                <Link
                  href={`/${album.name.toLowerCase()}`}
                  className="hover:text-gray-500"
                >
                  {album.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <footer
        className={`
          tracking-tight content
          absolute bottom-0 right-0 flex justify-end
          mr-36 mb-48 m-24 2xl:mr-64`}
      >
        <div className="text-3xl text-right">
          <p className="m-0 p-0 mt-1">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </section>
  );
}

export default Globe;
