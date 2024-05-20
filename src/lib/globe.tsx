'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import GlobeGL from 'react-globe.gl';
import type { GlobeProps, GlobeMethods } from 'react-globe.gl';
import { GeoJsonGeometry } from 'three-geojson-geometry';
import { geoGraticule10 } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useWindowSize } from '@/hooks/use-window-size';
import { Album, AlbumTitle, types } from '../types/albums';
import Link from 'next/link';

type Ref = CustomGlobeMethods | undefined; // Reference to globe instance
type GlobeEl = React.MutableRefObject<Ref>; // React `ref` passed to globe element

interface CustomGlobeMethods extends GlobeMethods {
  controls(): ReturnType<GlobeMethods['controls']> & {
    autoRotateForced: boolean;
  };
}

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

function usePoints(albums: Array<Album>) {
  const [altitude, setAltitude] = useState(0.002);
  const points = [];
  const locations = albums.filter(album => album.type === types.LOCATION);
  for (const album of locations) {
    points.push(
      { lat: album.lat, lng: album.lng, radius: 0.19 },
      ...album.locations.map(location => ({
        lat: location.lat,
        lng: location.lng,
        radius: 0.144
      }))
    );
  }
  return {
    pointAltitude: altitude,
    setPointAltitude: setAltitude,
    points
  };
}

function useRings(
  globeElRef: CustomGlobeMethods,
  setPointAltitude: React.Dispatch<React.SetStateAction<number>>
) {
  const [activeAlbum, setActiveAlbum] = useState<AlbumTitle>();

  const [rings, setRings] = useState<Array<Ring>>([]);
  const colorInterpolator = (t: number) =>
    `rgba(255,100,50,${Math.sqrt(1 - t)})`;

  const [enterTimeoutId, setEnterTimeoutId] = useState<NodeJS.Timeout>();
  function handleMouseEnter({ lat, lng, title, type }: Album) {
    setActiveAlbum(title);

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
        globeElRef.controls().autoRotateSpeed = 0.69;

        setRings([
          { lat, lng, maxR: 9, propagationSpeed: 0.88, repeatPeriod: 1777 }
        ]);
      } else if (type === types.CUSTOM) {
        setPointAltitude(2);

        globeElRef.controls().autoRotateForced = true;
        globeElRef.controls().autoRotateSpeed = 3.7 * DEFAULT_AUTOROTATE_SPEED;

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

    setActiveAlbum(undefined);

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

function generateArcs(albums: Array<Album>) {
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

function useArcs(albums: Array<Album>) {
  const [arcs, setArcs] = useState<Array<Arc>>([]);
  useEffect(() => {
    setArcs(generateArcs(albums));
  }, [albums]);

  return { arcs };
}

function useCustomLayer(globeEl: GlobeEl) {
  const numbers = Array.from(Array(500), (_, index) => index);
  const customLayerData = numbers.map(() => ({
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
  const customThreeObjectUpdate: GlobeProps['customThreeObjectUpdate'] = (
    object,
    objectData
  ) => {
    const typedObjectData = objectData as {
      lat: number;
      lng: number;
      alt: number;
    };
    Object.assign(
      object.position,
      globeEl.current?.getCoords(
        typedObjectData.lat,
        typedObjectData.lng,
        typedObjectData.alt
      )
    );
  };

  return {
    customLayerData,
    customThreeObject,
    customThreeObjectUpdate
  };
}

function useGlobeReady(globeEl: GlobeEl) {
  const [globeReady, setGlobeReady] = useState(false);

  // faster autoRotate speed over the ocean
  const autoRotateSpeed = () => {
    if (globeEl.current) {
      const { lng } = globeEl.current.pointOfView();
      let newSpeed = DEFAULT_AUTOROTATE_SPEED;

      // [ [ longitude, speed multiplier ], ... ]
      const gradientSteps = [
        // sppeed down
        [175, 2],
        [165, 1.88],
        [160, 1.77],
        [155, 1.65],
        [150, 1.5],
        [145, 1.25],

        // speed up
        [-160, 2.25],
        [-140, 2.0],
        [-120, 1.75],
        [-110, 1.65],
        [-115, 1.45],
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
        !globeEl.current.controls().autoRotateForced &&
        newSpeed !== DEFAULT_AUTOROTATE_SPEED
      ) {
        globeEl.current.controls().autoRotateSpeed = newSpeed;
      }
    }
    requestAnimationFrame(autoRotateSpeed);
  };

  useEffect(() => {
    if (globeReady && globeEl.current) {
      globeEl.current.controls().enabled = false;

      globeEl.current.controls().enableZoom = false;

      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = DEFAULT_AUTOROTATE_SPEED;

      globeEl.current.pointOfView({ lat: 30, lng: -30, altitude: 2 });

      autoRotateSpeed();
    }
  }, [globeEl, globeReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    handleGlobeReady: () => setGlobeReady(true)
  };
}

function useScene(globeElRef: Ref) {
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
}

const DEFAULT_AUTOROTATE_SPEED = 1.75;

function Globe({ albums }: { albums: Array<Album> }) {
  // object config
  const globeEl = useRef<Ref>();
  const globeElRef: Ref = globeEl.current;

  const { handleGlobeReady } = useGlobeReady(globeEl);

  // scene config
  useScene(globeElRef);

  // land shapes
  const { landPolygons, polygonMaterial } = useLandPolygons();

  // `albums` map points
  const { points, pointAltitude, setPointAltitude } = usePoints(albums);

  // rings animation
  const { rings, colorInterpolator, handleMouseEnter, handleMouseLeave } =
    useRings(globeElRef as CustomGlobeMethods, setPointAltitude);

  // arcs animation
  const { arcs } = useArcs(albums);

  // resize canvas on resize viewport
  const { width, height } = useWindowSize();

  // stars in the background
  const { customLayerData, customThreeObject, customThreeObjectUpdate } =
    useCustomLayer(globeEl);

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
        pointRadius={point => (point as { radius: number }).radius}
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
          my-36 m-12
          md:mt-48 md:ml-36 md:m-24
          2xl:ml-64`}
      >
        <h1 className="font-bold my-20 text-center md:text-left">
          Aaron Agarunov
        </h1>

        <ul
          className={`flex flex-col items-center
            md:items-start tracking-tight`}
        >
          {albums.map(album => {
            return (
              <li
                key={album.title}
                className="max-w-fit"
                onMouseEnter={() => {
                  handleMouseEnter(album);
                }}
                onMouseLeave={() => {
                  handleMouseLeave();
                }}
              >
                <Link
                  href={`/${album.title.toLowerCase()}`}
                  className="hover:text-gray-500"
                >
                  {album.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <footer
        className={`
          tracking-tight content
          absolute bottom-0 md:right-0 flex justify-end
          m-24
          md:mr-36 md:mb-48 md:m-24
          2xl:mr-64`}
      >
        <div className="text-3xl text-center md:text-right">
          <p className="m-0 p-0 mt-1">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </section>
  );
}

export default Globe;
