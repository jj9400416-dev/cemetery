import mapImage from '../assets/agnipa map.jpg';

// Grave photos present in /assets. Keys are normalized names.
import anaSantos from '../assets/Ana Santos.png';
import carlosDizon from '../assets/Carlos Dizon.png';
import isabelReyes from '../assets/Isabel Reyes.png';
import jonelCarpio from '../assets/Jonel Carpio.png';
import joseRizal from '../assets/Jose Rizal.png';
import juanDelacruz from '../assets/Juan Delacruz.png';
import luzMenduza from '../assets/Luz Menduza.png';
import mariaClara from '../assets/Maria Clara.jpg';
import marioKulob from '../assets/Mario Kulob.png';
import pedroPenduko from '../assets/Pedro Penduko.png';
import peroJesus from '../assets/Pero Jesus.png';
import ramonBautista from '../assets/Ramon Bautista.png';

export { mapImage };

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const PHOTO_MAP = {
  anasantos: anaSantos,
  carlosdizon: carlosDizon,
  isabelreyes: isabelReyes,
  jonelcarpio: jonelCarpio,
  joserizal: joseRizal,
  juandelacruz: juanDelacruz,
  juandelacruz2: juanDelacruz,
  luzmenduza: luzMenduza,
  luzmendoza: luzMenduza,
  mariaclara: mariaClara,
  mariokulob: marioKulob,
  pedropenduko: pedroPenduko,
  perojesus: peroJesus,
  ramonbautista: ramonBautista,
};

export function photoForName(name) {
  return PHOTO_MAP[normalize(name)] || null;
}

// Dela Cruz (with space) normalizes to "delacruz", so also map it explicitly.
PHOTO_MAP.juandelacruz = juanDelacruz;

export const INITIAL_CEMETERY_FEATURES = [
  { id: 'entranceEast', type: 'entrance', label: 'East Entrance', x: '88%', y: '35%', color: '#e67e22' },
  { id: 'entranceMain', type: 'entrance', label: 'Main Entrance (South)', x: '32%', y: '86%', color: '#e67e22' },
  { id: 'exitSouthEast', type: 'entrance', label: 'Exit', x: '78%', y: '60%', color: '#e67e22' },
];

// Polygons traced directly from the blue outlines in Agnipa.jpg.
// Extracted via blue-color segmentation + contour approximation (see overlay_holes.jpg verification).
// Points are % of map width/height. S1-S11 cover all 11 blue loops, top to bottom.
export const INITIAL_MAP_SECTIONS = [
  { id: 'S1', label: 'S1', color: '#4da6ff', points: [[59, 12.6], [58.5, 26.9], [41.7, 49.5], [41.1, 44], [35.1, 35.8], [35.2, 28.1], [51.4, 14.6], [53.1, 11.3]] },
  { id: 'S2', label: 'S2', color: '#4da6ff', points: [[75.5, 22.6], [79.7, 27.3], [80, 34], [78.8, 32.9], [78.4, 33.7], [74.1, 33]] },
  { id: 'S3', label: 'S3', color: '#4da6ff', points: [[61.8, 12.8], [61.6, 28.9], [49.2, 49.1], [42.8, 53.8], [41.8, 52], [59.6, 28.1], [60.3, 12.9]] },
  { id: 'S4', label: 'S4', color: '#4da6ff', points: [[64, 13.7], [74.3, 20.7], [72.8, 31.6], [48, 66.8], [44, 57.5], [62.9, 31.6]] },
  { id: 'S5', label: 'S5', color: '#4da6ff', points: [[23.7, 31.3], [31.1, 35.1], [39.7, 45.4], [40.2, 53.2], [17.8, 39.4]] },
  { id: 'S6', label: 'S6', color: '#4da6ff', points: [[16.2, 40.4], [41.5, 56.4], [43.6, 63.6], [25, 55.7], [24.4, 53.6], [23.1, 54.6], [11.6, 47.5]] },
  { id: 'S7', label: 'S7', color: '#4da6ff', points: [[79.4, 37.6], [52.7, 75], [49.1, 68.4], [59.9, 53.7], [62.2, 53.9], [61.2, 51.9], [72.7, 35]] },
  { id: 'S8', label: 'S8', color: '#4da6ff', points: [[82.2, 46.1], [78.6, 51], [81.8, 54.5], [75.2, 60.6], [73.2, 59.3], [74.9, 60.8], [60.3, 79.5], [54.1, 76.3], [69.2, 54.2], [78.8, 44.1]] },
  { id: 'S9', label: 'S9', color: '#4da6ff', points: [[17.7, 57.7], [20.6, 54.5], [35.6, 64.9], [37.3, 63.4], [46.6, 68.2], [48.1, 73.4], [52.8, 78.7], [51.2, 80.6]] },
  { id: 'S10', label: 'S10', color: '#4da6ff', points: [[24.7, 69.9], [27.5, 66.4], [46.9, 79.6], [47.2, 80.8], [49.3, 81.3], [36.4, 82.6], [32.8, 80.3], [34.6, 77.5]] },
  { id: 'S11', label: 'S11', color: '#4da6ff', points: [[57.4, 88], [48.2, 93.2], [37.8, 84.6], [53, 83.3]] },
];

export const INITIAL_PLACES = [
  { id: 1, name: 'Juan Dela Cruz', section: 'S7', birthdate: 'January 15, 1940', dod: 'February 10, 2020', x: '57.7%', y: '64.8%' },
  { id: 2, name: 'Pero Jesus', section: 'S2', birthdate: 'March 18, 1952', dod: 'June 22, 2018', x: '77%', y: '28%' },
  { id: 3, name: 'Maria Clara', section: 'S4', birthdate: 'October 4, 1938', dod: 'December 9, 2019', x: '65%', y: '28%' },
  { id: 4, name: 'Jose Rizal', section: 'S4', birthdate: 'June 19, 1861', dod: 'December 30, 1896', x: '58%', y: '45%' },
  { id: 5, name: 'Pedro Penduko', section: 'S5', birthdate: 'August 2, 1948', dod: 'July 14, 2021', x: '28%', y: '40%' },
  { id: 6, name: 'Mario Kulob', section: 'S6', birthdate: 'September 10, 1955', dod: 'March 8, 2022', x: '18%', y: '47%' },
  { id: 7, name: 'Jonel Carpio', section: 'S8', birthdate: 'November 30, 1963', dod: 'April 5, 2023', x: '72%', y: '62%' },
  { id: 8, name: 'Ana Santos', section: 'S10', birthdate: 'January 25, 1948', dod: 'August 14, 2021', x: '43%', y: '78%' },
  { id: 9, name: 'Carlos Dizon', section: 'S3', birthdate: 'May 12, 1939', dod: 'September 21, 2020', x: '61%', y: '25%' },
  { id: 10, name: 'Luz Mendoza', section: 'S2', birthdate: 'July 6, 1944', dod: 'November 3, 2022', x: '77%', y: '30%' },
  { id: 11, name: 'Ramon Bautista', section: 'S7', birthdate: 'August 11, 1959', dod: 'March 19, 2024', x: '66%', y: '53%' },
  { id: 12, name: 'Isabel Reyes', section: 'S9', birthdate: 'March 9, 1942', dod: 'July 8, 2023', x: '32%', y: '58%' },
];
