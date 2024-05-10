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

function Globe() {
  // globe land shapes
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

  // globe object config
  const globeEl = useRef();
  const globeElRef = globeEl.current;
  const handleGlobeReady = () => {
    globeElRef.controls().enabled = false;

    globeElRef.controls().enableZoom = false;

    globeElRef.controls().autoRotate = true;
    globeElRef.controls().autoRotateSpeed = 1.5;

    globeElRef.pointOfView({ lat: 30, lng: -30, altitude: 2 });
  };

  // globe scene config
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

  // globe rings animation
  const [rings, setRings] = useState<Array<Ring>>([]);
  const colorInterpolator = t => `rgba(255,100,50,${Math.sqrt(1 - t)})`;

  const [enterTimeoutId, setEnterTimeoutId] = useState<NodeJS.Timeout>();
  function handleMouseEnter({ lat, lng, name, type }) {
    clearTimeout(enterTimeoutId);
    globeElRef.controls().autoRotateSpeed = 0.1;

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

        globeElRef.controls().autoRotateSpeed = 0.75;

        setRings([
          { lat, lng, maxR: 9, propagationSpeed: 0.75, repeatPeriod: 1750 }
        ]);
      } else if (type === types.CUSTOM) {
        globeElRef.controls().autoRotateSpeed = 4;

        setRings([
          {
            lat: 90,
            lng: 0,
            maxR: 180,
            propagationSpeed: 20,
            repeatPeriod: 200
          }
        ]);
      }
    }, 0);
    setEnterTimeoutId(id);
  }
  function handleMouseLeave() {
    globeElRef.pointOfView(
      {
        lat: 30,
        altitude: 2
      },
      1000
    );

    globeElRef.controls().autoRotateSpeed = 1.5;

    setRings([]);
  }

  // globe arcs animation
  const [arcs, setArcs] = useState<Array<Arc>>([]);
  useEffect(() => {
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
    setArcs(data);
  }, []);

  // resize canvas on resize viewport
  const { width, height } = useWindowSize();

  // background spheres
  const backgroundLayer = {
    customLayerData: [...Array(500).keys()].map(() => ({
      lat: (Math.random() - 0.5) * 180,
      lng: (Math.random() - 0.5) * 360,
      alt: Math.random() * 1.4 + 0.1
    })),
    customThreeObject: () =>
      new THREE.Mesh(
        new THREE.SphereGeometry(0.22),
        new THREE.MeshBasicMaterial({
          color: '#777777',
          opacity: 0.25,
          transparent: true
        })
      ),
    customThreeObjectUpdate: (object, objectData) =>
      Object.assign(
        object.position,
        globeElRef?.getCoords(objectData.lat, objectData.lng, objectData.alt)
      )
  };

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
        ringsData={rings}
        ringColor={() => colorInterpolator}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        arcsData={arcs}
        arcColor={'color'}
        arcDashLength={() => Math.random() / 1}
        arcDashGap={() => Math.random() * 10}
        arcDashAnimateTime={() => Math.random() * 20000 + 500}
        customLayerData={backgroundLayer.customLayerData}
        customThreeObject={backgroundLayer.customThreeObject}
        customThreeObjectUpdate={backgroundLayer.customThreeObjectUpdate}
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
                <Link href={`/${album.name.toLowerCase()}`}>{album.name}</Link>
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
