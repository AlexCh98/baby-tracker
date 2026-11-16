// Contenido de la sección Desarrollo: actividades de estimulación, consejos e hitos.
// Hitos de 2 a 12 meses: CDC "Learn the Signs. Act Early" (lo que hacen el 75 % o más de los bebés a esa edad).
// Tiempo boca abajo: NICHD/NIH (2-3 sesiones de 3-5 min al nacer; 15-30 min/día a los 2 meses) y OMS (≥ 30 min/día en menores de 1 año que aún no gatean).

export const AREAS = {
  vinculo: ['💞', 'Vínculo'], vista: ['👀', 'Vista'], oido: ['👂', 'Oído'], tacto: ['🤲', 'Tacto'],
  motor: ['💪', 'Motor'], lenguaje: ['💬', 'Lenguaje'], cognitivo: ['🧠', 'Cognitivo'], equilibrio: ['🌀', 'Equilibrio'],
};

// min/max: edad en días (corregida si fue prematuro).
export const ACTIVIDADES = [
  // ---- Recién nacido (0-1 mes)
  { id: 'piel', min: 0, max: 120, area: 'vinculo', icon: '🤱', titulo: 'Piel con piel', dur: '15-60 min',
    como: 'Con el bebé solo con pañal sobre tu pecho desnudo, tapados con una manta. Respira tranquilo y háblale bajito. Lo puede hacer papá también.',
    porque: 'Regula su temperatura, respiración y ritmo cardiaco, favorece la lactancia y es la base del vínculo y la sensación de seguridad.' },
  { id: 'caras', min: 0, max: 90, area: 'vista', icon: '😮', titulo: 'Cara a cara', dur: '2-5 min',
    como: 'Con el bebé despierto y tranquilo, ponte a 20-30 cm de su cara. Sonríe, abre la boca, saca la lengua despacio y espera: a veces te imita.',
    porque: 'Las caras son lo que más le interesa al nacer y a esa distancia es donde mejor enfoca. Estimula la vista, la atención y la comunicación.' },
  { id: 'hablar', min: 0, max: 365, area: 'lenguaje', icon: '🗣️', titulo: 'Cuéntale lo que haces', dur: 'Durante el día',
    como: 'En cambios de pañal, baño o tomas, narra lo que hacéis con voz suave y cantarina: “ahora te quito el body, ¡qué piernas más fuertes!”.',
    porque: 'Oír muchas palabras dirigidas a él es lo que más influye en el desarrollo del lenguaje. La voz de sus padres es su sonido favorito.' },
  { id: 'contraste', min: 0, max: 100, area: 'vista', icon: '🔲', titulo: 'Tarjetas blanco y negro', dur: '1-3 min',
    como: 'Enséñale una tarjeta de alto contraste a 20-30 cm. Cuando la mire, muévela muy despacio hacia un lado para que la siga con los ojos. Tienes tarjetas para imprimir en “Música y tarjetas”.',
    porque: 'Al principio ve sobre todo contrastes fuertes. Seguir patrones con la mirada ejercita los músculos de los ojos y la atención.' },
  { id: 'masaje', min: 7, max: 365, area: 'tacto', icon: '👐', titulo: 'Masaje suave', dur: '5-10 min',
    como: 'Tras el baño, en una habitación cálida, con unas gotas de aceite vegetal sin perfume. Movimientos lentos de piernas, pies, brazos y espalda. Evita la tripa hasta que caiga el cordón. Para si llora o se agobia.',
    porque: 'El tacto le relaja, ayuda a conocer su propio cuerpo y refuerza el vínculo. A muchos bebés les ayuda a dormir mejor.' },
  { id: 'pecho', min: 0, max: 45, area: 'motor', icon: '🧸', titulo: 'Boca abajo sobre tu pecho', dur: '3-5 min, 2-3 veces',
    como: 'Recostado hacia atrás, pon al bebé boca abajo sobre tu pecho. Háblale para que intente levantar la cabeza para mirarte. Siempre despierto y vigilado.',
    porque: 'Es la forma más amable de empezar el tiempo boca abajo: fortalece cuello y espalda y previene que se le aplane la cabeza.' },
  { id: 'sonajero', min: 0, max: 150, area: 'oido', icon: '🪇', titulo: 'Busca el sonido', dur: '1-2 min',
    como: 'Agita suavemente un sonajero a un lado de su cabeza, fuera de su vista, a unos 30 cm. Espera unos segundos a ver si se queda quieto o gira los ojos o la cabeza. Repite por el otro lado.',
    porque: 'Trabaja la localización de sonidos y la atención. Que reaccione a los ruidos también es una buena señal de que oye bien.' },
  { id: 'pataleo', min: 0, max: 180, area: 'motor', icon: '🦵', titulo: 'Pataleo libre', dur: '5 min',
    como: 'En el cambiador o sobre una manta, déjale unos minutos sin pañal o con poca ropa para que mueva libremente brazos y piernas. Sin soltarle la mano si está en alto.',
    porque: 'Moverse sin ropa que apriete le ayuda a descubrir su cuerpo y a ganar fuerza.' },
  { id: 'mecer', min: 0, max: 365, area: 'equilibrio', icon: '🌀', titulo: 'Mecer y cambiar de posición', dur: 'Durante el día',
    como: 'Mécele suavemente en brazos, en distintas posturas: tumbado, en vertical apoyado en tu hombro, de lado. Movimientos lentos y siempre sujetando bien la cabeza. Nunca le agites.',
    porque: 'El movimiento suave estimula el sistema vestibular (el del equilibrio) y le calma.' },
  { id: 'nana', min: 0, max: 365, area: 'oido', icon: '🎵', titulo: 'Cántale una canción', dur: '2-5 min',
    como: 'Cántale una nana o cualquier canción que te guste, mirándole a la cara. No hace falta cantar bien: tu voz es lo que importa. Repetir siempre la misma antes de dormir crea una rutina.',
    porque: 'La música y el ritmo estimulan el oído y el lenguaje, y una canción repetida le da seguridad.' },
  { id: 'texturas', min: 14, max: 200, area: 'tacto', icon: '🧶', titulo: 'Texturas suaves', dur: '2-3 min',
    como: 'Pasa por sus manos, pies y mejillas telas distintas: algodón, lana suave, seda, una pluma, una muselina. Dile cómo se llama cada una.',
    porque: 'Distinguir texturas desarrolla el sentido del tacto, que es el más maduro al nacer.' },
  // ---- 1 a 3 meses
  { id: 'turnos', min: 30, max: 270, area: 'lenguaje', icon: '💬', titulo: 'Conversación por turnos', dur: '3-5 min',
    como: 'Cuando haga ruiditos (“ajó”, “oooh”), respóndele imitándolos y espera a que vuelva a “hablar”. Exagera la entonación y la expresión de la cara.',
    porque: 'Así aprende cómo funciona una conversación: escuchar, esperar el turno y responder.' },
  { id: 'barriga-juguete', min: 30, max: 200, area: 'motor', icon: '🪞', titulo: 'Boca abajo con estímulo', dur: '3-10 min',
    como: 'Sobre una manta en el suelo, boca abajo. Pon delante un espejo irrompible, un juguete de colores o túmbate tú frente a él. Si cuesta, una toalla enrollada bajo el pecho le ayuda.',
    porque: 'Le motiva a levantar la cabeza y apoyarse en los antebrazos: base para voltearse, sentarse y gatear.' },
  { id: 'arco', min: 30, max: 120, area: 'vista', icon: '🌈', titulo: 'Sigue el objeto', dur: '1-2 min',
    como: 'Con un juguete de colores vivos (el rojo es el primero que distingue bien) a 25-30 cm, muévelo despacio de un lado a otro haciendo un arco, y luego arriba y abajo.',
    porque: 'Entrena el seguimiento visual y la coordinación de los ojos, que mejora mucho entre el mes y los 3 meses.' },
  { id: 'bici', min: 21, max: 180, area: 'motor', icon: '🚲', titulo: 'Bicicleta con las piernas', dur: '1-2 min',
    como: 'Boca arriba, cógele de los tobillos y mueve sus piernas como si pedaleara, despacio, cantando. También puedes llevarle las rodillas suavemente a la tripa.',
    porque: 'Le hace consciente de sus piernas y a muchos bebés les ayuda a expulsar gases.' },
  { id: 'cuento', min: 30, max: 365, area: 'lenguaje', icon: '📖', titulo: 'Leer en voz alta', dur: '5 min',
    como: 'Léele un libro de imágenes grandes y contrastadas (o cualquier libro que te guste a ti). Señala las imágenes y cambia la voz.',
    porque: 'Leer desde muy pequeños se asocia a mejor lenguaje más adelante, y crea un momento tranquilo compartido.' },
  { id: 'lado', min: 30, max: 120, area: 'motor', icon: '🤲', titulo: 'Tumbado de lado', dur: '2-5 min',
    como: 'Túmbale de lado sobre la manta, con una toalla enrollada en la espalda para que no se vuelque. Pon un juguete delante de sus manos. Cambia de lado.',
    porque: 'En esta postura le resulta fácil juntar las manos delante y llevarlas a la boca, y alivia la presión de la cabeza.' },
  { id: 'agarrar', min: 45, max: 180, area: 'motor', icon: '✊', titulo: 'Agarra el sonajero', dur: '2 min',
    como: 'Pon un sonajero ligero en su mano. Al principio lo soltará enseguida; cuando lo sujete, mueve su mano para que suene.',
    porque: 'Pasa del reflejo de agarre a agarrar a propósito, y descubre que sus movimientos producen efectos.' },
  // ---- 3 a 6 meses
  { id: 'gimnasio', min: 75, max: 220, area: 'motor', icon: '🎠', titulo: 'Alcanzar y golpear', dur: '5-10 min',
    como: 'Boca arriba bajo un gimnasio de actividades o con juguetes colgando a la altura de sus manos y pies, para que intente tocarlos y golpearlos.',
    porque: 'Coordina vista y manos y fortalece brazos y tronco.' },
  { id: 'volteo', min: 100, max: 220, area: 'motor', icon: '🔄', titulo: 'Ayúdale a voltearse', dur: '2-3 min',
    como: 'Boca arriba, pon un juguete a un lado, fuera de su alcance, para que gire a buscarlo. Ayúdale suavemente empujando la cadera o cruzando una pierna sobre la otra. Practica por los dos lados.',
    porque: 'Voltearse es su primer gran desplazamiento y fortalece el tronco.' },
  { id: 'espejo', min: 100, max: 365, area: 'cognitivo', icon: '🪞', titulo: 'Juego del espejo', dur: '3 min',
    como: 'Ponte con él delante de un espejo. Señala: “¿quién es ese bebé?”, “¡ahí está mamá!”. Haz caras y deja que se mire.',
    porque: 'Le encanta ver caras, la suya también. Prepara el reconocimiento de sí mismo y de los demás.' },
  { id: 'pedorretas', min: 100, max: 300, area: 'lenguaje', icon: '😛', titulo: 'Juego de sonidos', dur: '3 min',
    como: 'Haz pedorretas, “brrr”, chasquidos o sonidos de animales y espera a ver si te imita. Imita tú también sus sonidos.',
    porque: 'Juega con la boca y la voz, que son los cimientos del habla.' },
  { id: 'boca', min: 110, max: 300, area: 'tacto', icon: '🥄', titulo: 'Explorar con la boca', dur: '5 min',
    como: 'Dale objetos seguros de distintas formas, texturas y temperaturas: un mordedor frío de la nevera, una cuchara de silicona, un aro de madera. Siempre grandes (que no quepan en un rollo de papel higiénico) y vigilando.',
    porque: 'A esta edad la boca es su principal forma de conocer los objetos.' },
  { id: 'cucu', min: 120, max: 365, area: 'cognitivo', icon: '🙈', titulo: '¡Cucú-tras!', dur: '2-3 min',
    como: 'Tápate la cara con las manos o una muselina y destápate diciendo “¡cucú, tras!”. Más adelante, deja que sea él quien te destape.',
    porque: 'Le enseña que las cosas siguen existiendo aunque no las vea (permanencia del objeto) y le hace reír.' },
  { id: 'cuerpo', min: 120, max: 365, area: 'lenguaje', icon: '👶', titulo: 'Nombrar el cuerpo', dur: 'Al vestirle',
    como: 'Al vestirle o en el baño, toca y nombra: “la mano”, “los pies”, “la tripa”. Puedes cantarlo.',
    porque: 'Asocia palabras a partes de su cuerpo y gana vocabulario mucho antes de poder decirlo.' },
  { id: 'sentado', min: 150, max: 260, area: 'motor', icon: '🪑', titulo: 'Sentado con apoyo', dur: '3-5 min',
    como: 'Siéntale en el suelo entre tus piernas o con cojines alrededor, con un juguete delante para que se apoye en las manos. Siempre con alguien al lado.',
    porque: 'Fortalece el tronco y el equilibrio para sentarse solo.' },
  // ---- 6 a 12 meses
  { id: 'esconder', min: 200, max: 365, area: 'cognitivo', icon: '🧺', titulo: '¿Dónde está el juguete?', dur: '3 min',
    como: 'Esconde un juguete bajo una manta mientras te mira y anímale a encontrarlo. Al principio deja una parte a la vista.',
    porque: 'Refuerza la permanencia del objeto y la resolución de problemas.' },
  { id: 'manos', min: 180, max: 300, area: 'motor', icon: '🤹', titulo: 'De una mano a otra', dur: '3 min',
    como: 'Dale un juguete en una mano y luego ofrécele otro a esa misma mano: tendrá que pasar el primero a la otra.',
    porque: 'Coordina las dos manos y la motricidad fina.' },
  { id: 'percusion', min: 200, max: 365, area: 'oido', icon: '🥁', titulo: 'Orquesta de cocina', dur: '5 min',
    como: 'Dale una cuchara de madera y un cazo o dos bloques para que los golpee. Haz tú también ritmos y que te imite.',
    porque: 'Causa-efecto, ritmo y coordinación. Les encanta hacer ruido.' },
  { id: 'gatear', min: 210, max: 365, area: 'motor', icon: '🐛', titulo: 'Ven a por él', dur: '5-10 min',
    como: 'Pon un juguete atractivo un poco fuera de su alcance mientras está boca abajo o a gatas. Haz caminos con cojines para que los supere.',
    porque: 'Le motiva a arrastrarse y gatear, que desarrolla fuerza, coordinación y visión espacial.' },
  { id: 'meter', min: 240, max: 365, area: 'cognitivo', icon: '📦', titulo: 'Meter y sacar', dur: '5 min',
    como: 'Dale un cubo o caja y bloques o pelotas grandes para meterlos y sacarlos. Primero sacar, que es más fácil.',
    porque: 'Aprende conceptos como dentro/fuera y mejora la precisión de las manos.' },
  { id: 'gestos', min: 180, max: 365, area: 'lenguaje', icon: '👏', titulo: 'Canciones con gestos', dur: '3-5 min',
    como: 'Canciones como “Cinco lobitos” o “Palmas palmitas”, haciendo los gestos con sus manos. Repítelas mucho: la repetición le encanta.',
    porque: 'Une lenguaje, ritmo e imitación; pronto empezará a hacer los gestos solo.' },
  { id: 'adios', min: 240, max: 365, area: 'lenguaje', icon: '👋', titulo: 'Decir adiós y señalar', dur: 'Durante el día',
    como: 'Di adiós con la mano a las visitas, señala lo que nombras (“¡mira, un perro!”) y espera a que mire lo que señalas.',
    porque: 'Los gestos son el paso previo a las primeras palabras.' },
  { id: 'tesoros', min: 180, max: 365, area: 'tacto', icon: '🧺', titulo: 'Cesto de los tesoros', dur: '10 min',
    como: 'Un cesto con objetos cotidianos seguros de materiales naturales: cuchara de madera, pelota de lana, piña grande, esponja natural, aro metálico. Déjale explorar solo, a su ritmo, mientras le acompañas.',
    porque: 'Descubre pesos, texturas, temperaturas y sonidos; fomenta la concentración y la autonomía.' },
  { id: 'depie', min: 270, max: 365, area: 'motor', icon: '🧍', titulo: 'De pie con apoyo', dur: '5 min',
    como: 'Pon juguetes sobre el sofá o una mesa baja para que se agarre y se ponga de pie. Mejor descalzo. Evita los andadores.',
    porque: 'Prepara los primeros pasos de forma natural. Los andadores no ayudan a andar antes y causan accidentes.' },
  { id: 'libros', min: 240, max: 365, area: 'lenguaje', icon: '📚', titulo: 'Libros para tocar', dur: '5 min',
    como: 'Libros de tela o cartón: deja que pase las páginas, señala y nombra, pregúntale “¿dónde está el gato?”.',
    porque: 'Comprende muchas más palabras de las que dice; esto le ayuda a relacionarlas con imágenes.' },
];

export const CONSEJOS = [
  { min: 0, max: 60, texto: 'Menos es más: los recién nacidos se cansan enseguida. Bastan unos minutos cuando está despierto y tranquilo (“alerta tranquila”).' },
  { min: 0, max: 365, texto: 'Si bosteza, aparta la mirada, arquea la espalda o llora, está saturado: para y simplemente abrázale.' },
  { min: 0, max: 365, texto: 'A dormir siempre boca arriba; boca abajo solo para jugar, despierto y vigilado.' },
  { min: 0, max: 120, texto: 'Ve mejor a 20-30 cm (la distancia de tu cara cuando le das de comer) y le atraen los contrastes fuertes y las caras.' },
  { min: 0, max: 365, texto: 'Cada bebé tiene su ritmo. Las actividades son ideas para jugar, no deberes: un día sin hacerlas no pasa nada.' },
  { min: 0, max: 365, texto: 'Pantallas: la OMS recomienda que los menores de 1 año no las usen. Mejor caras, voces, libros y juguetes.' },
  { min: 0, max: 90, texto: 'Si el tiempo boca abajo le cuesta, empieza sobre tu pecho, justo después de un cambio de pañal, y nunca justo después de comer.' },
  { min: 0, max: 365, texto: 'Hablarle mucho es la mejor estimulación del lenguaje: narra lo que haces, cántale, léele.' },
  { min: 0, max: 365, texto: 'Si nació antes de la semana 37, sus hitos se miran por la edad corregida. Puedes indicarlo en Ajustes.' },
  { min: 30, max: 365, texto: 'Responder rápido a su llanto no le “malcría”: le da seguridad, y los bebés seguros exploran más.' },
  { min: 60, max: 365, texto: 'Deja tiempo de suelo libre sobre una manta: la hamaca o la silla del coche, solo lo necesario.' },
  { min: 100, max: 365, texto: 'Todo va a la boca: revisa que los juguetes sean grandes y sin piezas sueltas.' },
  { min: 150, max: 365, texto: 'Lo que más estimula es la rutina diaria: comidas, baño y paseos son oportunidades para hablar y jugar.' },
];

// Objetivo diario de tiempo boca abajo (minutos) según edad en días.
export function objetivoBarriga(dias) {
  if (dias < 14) return 10;
  if (dias < 60) return Math.round(10 + (dias - 14) * (20 / 46));
  return 30;
}

// Hitos. mes: edad en meses. El de 1 mes es orientativo (no es una lista CDC).
export const HITOS = [
  { mes: 1, orientativo: true, items: [
    { id: 'm1-cara', area: 'vista', texto: 'Fija la mirada en tu cara unos segundos' },
    { id: 'm1-calma', area: 'vinculo', texto: 'Se calma cuando le coges o le hablas' },
    { id: 'm1-sonido', area: 'oido', texto: 'Reacciona a ruidos fuertes (se sobresalta, parpadea, se queda quieto)' },
    { id: 'm1-cabeza', area: 'motor', texto: 'Boca abajo, levanta un momento la cabeza o la gira de lado' },
    { id: 'm1-mueve', area: 'motor', texto: 'Mueve los dos brazos y las dos piernas por igual' },
  ] },
  { mes: 2, items: [
    { id: 'm2-calma', area: 'vinculo', texto: 'Se calma cuando le hablas o le coges' },
    { id: 'm2-mira', area: 'vinculo', texto: 'Te mira a la cara' },
    { id: 'm2-alegra', area: 'vinculo', texto: 'Parece contento de verte cuando te acercas' },
    { id: 'm2-sonrie', area: 'vinculo', texto: 'Sonríe cuando le hablas o le sonríes' },
    { id: 'm2-sonidos', area: 'lenguaje', texto: 'Hace sonidos distintos al llanto' },
    { id: 'm2-ruidos', area: 'oido', texto: 'Reacciona a ruidos fuertes' },
    { id: 'm2-sigue', area: 'cognitivo', texto: 'Te sigue con la mirada cuando te mueves' },
    { id: 'm2-juguete', area: 'cognitivo', texto: 'Mira un juguete durante varios segundos' },
    { id: 'm2-cabeza', area: 'motor', texto: 'Levanta la cabeza cuando está boca abajo' },
    { id: 'm2-mueve', area: 'motor', texto: 'Mueve los dos brazos y las dos piernas' },
    { id: 'm2-manos', area: 'motor', texto: 'Abre las manos brevemente' },
  ] },
  { mes: 4, items: [
    { id: 'm4-sonrie', area: 'vinculo', texto: 'Sonríe por su cuenta para llamar tu atención' },
    { id: 'm4-risa', area: 'vinculo', texto: 'Hace risitas (aún no carcajadas) cuando intentas hacerle reír' },
    { id: 'm4-atencion', area: 'vinculo', texto: 'Te mira, se mueve o hace sonidos para llamar o mantener tu atención' },
    { id: 'm4-gorjeo', area: 'lenguaje', texto: 'Hace sonidos como “oooo” o “aaah” (gorjeos)' },
    { id: 'm4-responde', area: 'lenguaje', texto: 'Te responde con sonidos cuando le hablas' },
    { id: 'm4-voz', area: 'oido', texto: 'Gira la cabeza hacia tu voz' },
    { id: 'm4-hambre', area: 'cognitivo', texto: 'Si tiene hambre, abre la boca al ver el pecho o el biberón' },
    { id: 'm4-mira-manos', area: 'cognitivo', texto: 'Se mira las manos con interés' },
    { id: 'm4-cabeza', area: 'motor', texto: 'Sostiene la cabeza firme sin apoyo cuando le coges' },
    { id: 'm4-sujeta', area: 'motor', texto: 'Sujeta un juguete si se lo pones en la mano' },
    { id: 'm4-golpea', area: 'motor', texto: 'Mueve el brazo para golpear juguetes' },
    { id: 'm4-boca', area: 'motor', texto: 'Se lleva las manos a la boca' },
    { id: 'm4-codos', area: 'motor', texto: 'Boca abajo, se apoya en los codos o antebrazos' },
  ] },
  { mes: 6, items: [
    { id: 'm6-conoce', area: 'vinculo', texto: 'Reconoce a las personas conocidas' },
    { id: 'm6-espejo', area: 'vinculo', texto: 'Le gusta mirarse en el espejo' },
    { id: 'm6-rie', area: 'vinculo', texto: 'Se ríe' },
    { id: 'm6-turnos', area: 'lenguaje', texto: 'Hace sonidos por turnos contigo' },
    { id: 'm6-pedorretas', area: 'lenguaje', texto: 'Hace pedorretas (saca la lengua y sopla)' },
    { id: 'm6-chillidos', area: 'lenguaje', texto: 'Hace grititos agudos' },
    { id: 'm6-boca', area: 'cognitivo', texto: 'Se mete cosas en la boca para explorarlas' },
    { id: 'm6-alcanza', area: 'cognitivo', texto: 'Estira el brazo para coger un juguete que quiere' },
    { id: 'm6-labios', area: 'cognitivo', texto: 'Cierra los labios cuando no quiere más comida' },
    { id: 'm6-voltea', area: 'motor', texto: 'Se da la vuelta de boca abajo a boca arriba' },
    { id: 'm6-brazos', area: 'motor', texto: 'Boca abajo, se levanta con los brazos estirados' },
    { id: 'm6-apoya', area: 'motor', texto: 'Sentado, se apoya en las manos para sostenerse' },
  ] },
  { mes: 9, items: [
    { id: 'm9-extranos', area: 'vinculo', texto: 'Se muestra tímido, pegado a vosotros o con miedo ante desconocidos' },
    { id: 'm9-expresiones', area: 'vinculo', texto: 'Pone distintas caras: contento, triste, enfadado, sorprendido' },
    { id: 'm9-nombre', area: 'lenguaje', texto: 'Mira cuando le llamas por su nombre' },
    { id: 'm9-te-vas', area: 'vinculo', texto: 'Reacciona cuando te vas (mira, te busca o llora)' },
    { id: 'm9-cucu', area: 'vinculo', texto: 'Sonríe o se ríe cuando jugáis a cucú-tras' },
    { id: 'm9-silabas', area: 'lenguaje', texto: 'Hace sonidos como “mamamama” y “babababa”' },
    { id: 'm9-brazos', area: 'lenguaje', texto: 'Levanta los brazos para que le cojas' },
    { id: 'm9-busca', area: 'cognitivo', texto: 'Busca objetos que se le caen y deja de ver (la cuchara, un juguete)' },
    { id: 'm9-golpea', area: 'cognitivo', texto: 'Golpea dos cosas entre sí' },
    { id: 'm9-sentarse', area: 'motor', texto: 'Se sienta solo' },
    { id: 'm9-mano', area: 'motor', texto: 'Pasa cosas de una mano a la otra' },
    { id: 'm9-rastrillo', area: 'motor', texto: 'Arrastra la comida hacia sí con los dedos' },
    { id: 'm9-sin-apoyo', area: 'motor', texto: 'Se mantiene sentado sin apoyo' },
  ] },
  { mes: 12, items: [
    { id: 'm12-juegos', area: 'vinculo', texto: 'Juega contigo a juegos como “palmas palmitas”' },
    { id: 'm12-adios', area: 'lenguaje', texto: 'Dice adiós con la mano' },
    { id: 'm12-mama', area: 'lenguaje', texto: 'Llama a sus padres “mamá”, “papá” u otro nombre especial' },
    { id: 'm12-no', area: 'lenguaje', texto: 'Entiende el “no” (se para un momento o deja de hacerlo)' },
    { id: 'm12-meter', area: 'cognitivo', texto: 'Mete algo en un recipiente, como un bloque en un vaso' },
    { id: 'm12-escondido', area: 'cognitivo', texto: 'Busca cosas que ve que escondes, como un juguete bajo una manta' },
    { id: 'm12-pie', area: 'motor', texto: 'Se pone de pie agarrándose' },
    { id: 'm12-muebles', area: 'motor', texto: 'Camina agarrado a los muebles' },
    { id: 'm12-vaso', area: 'motor', texto: 'Bebe de un vaso sin tapa si se lo sujetas' },
    { id: 'm12-pinza', area: 'motor', texto: 'Coge cosas pequeñas con el pulgar y el índice (pinza)' },
  ] },
];

// Selección diaria determinista (la misma para los dos móviles ese día).
export function actividadesDelDia(dias, diaKey, n = 4) {
  const elig = ACTIVIDADES.filter((a) => dias >= a.min && dias <= a.max);
  let seed = 0;
  for (const ch of diaKey) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = [...elig];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [], areas = new Set();
  for (const a of pool) { if (out.length < n && !areas.has(a.area)) { out.push(a); areas.add(a.area); } }
  for (const a of pool) { if (out.length < n && !out.includes(a)) out.push(a); }
  return { hoy: out, todas: elig };
}
