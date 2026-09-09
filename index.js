require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR Y ENTORNO
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyInkk Bot - Ultimate Professional Edition ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Servidor HTTP activo en puerto ${PORT}`);
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const MI_ID = process.env.MI_ID;

if (!BOT_TOKEN || !MI_ID) {
    console.error('[FATAL] Faltan variables de entorno BOT_TOKEN o MI_ID.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ==========================================
// 2. BASE DE DATOS AVANZADA (ESTRUCTURA ROBUSTA)
// ==========================================
let db = { 
    usuarios: {},     // { id: { nombre, telefono, nivelVIP, puntos, referidosCount } }
    referidos: {},    // { inviterId: count }
    invitados: {},    // { invitadoId: inviterId }
    fichas: {}, 
    puntos: {},       // { id: puntosTotales }
    cupones: {},      // { codigo: descuento }
    tarjetasRegalo: {}, // { codigo: { id, beneficiario, importe, canjeada, fecha } }
    citas: [],        // [{ id, clienteId, nombre, telefono, fecha, fechaTexto, descripcion, avisado24h }]
    alarmas: {},      // { id: timestamp }
    cumples: {},      // { id: "DD/MM" }
    ultima_ruleta: {},// { id: "YYYY-MM-DD" }
    mantenimiento: false 
};

const DATA_FILE = path.join('/tmp', 'database_ultimate.json');

function cargarBaseDatos() {
    if (fs.existsSync(DATA_FILE)) {
        try { 
            const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
            const parsed = JSON.parse(contenido);
            db = { ...db, ...parsed };
            console.log('[DB] Base de datos Ultimate cargada correctamente.');
        } catch (e) { 
            console.error('[DB ERROR] Error al parsear database_ultimate.json:', e); 
        }
    }
}
cargarBaseDatos();

function guardar() {
    try { 
        const tempFile = `${DATA_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
        fs.renameSync(tempFile, DATA_FILE);
    } catch (e) { 
        console.error('[DB ERROR] Fallo crítico al guardar la base de datos:', e); 
    }
}

// ==========================================
// 3. UTILIDADES Y LOGICA DE FIDELIZACIÓN VIP
// ==========================================
const notificarAdmin = (ctx, accion) => {
    try {
        if (ctx.from && ctx.from.id.toString() !== MI_ID.toString()) {
            const usuario = ctx.from.first_name || "Desconocido";
            const id = ctx.from.id;
            const username = ctx.from.username ? `@${ctx.from.username}` : "Sin alias";
            
            bot.telegram.sendMessage(
                MI_ID, 
                `🔥 *ACTIVIDAD VIP SPICYINKK*\n\n👤 *Usuario:* ${usuario} (${username})\n🆔 *ID:* \`${id}\`\n⚡ *Acción:* ${accion}`, 
                { parse_mode: 'Markdown' }
            ).catch(err => console.error('[TELEGRAM ERROR] Al notificar admin:', err.message));
        }
    } catch (e) {
        console.error('[ERROR] notificarAdmin:', e);
    }
};

function sumarPuntos(uid, cantidad) {
    if (!db.puntos[uid]) db.puntos[uid] = 0;
    db.puntos[uid] += cantidad;
    
    // Lógica de Niveles VIP automáticos según puntos
    let nivel = 'Bronce 🥉';
    const pts = db.puntos[uid];
    if (pts >= 100) nivel = 'Platino 💎';
    else if (pts >= 50) nivel = 'Oro 🥇';
    else if (pts >= 25) nivel = 'Plata 🥈';

    if (!db.usuarios[uid]) db.usuarios[uid] = {};
    db.usuarios[uid].nivelVIP = nivel;
    guardar();
    return pts;
}

function parsearFecha(texto) {
    try {
        const [fecha, hora] = texto.trim().split(' ');
        if (!fecha || !hora) return null;
        const [dia, mes, anio] = fecha.split('/').map(Number);
        const [horas, minutos] = hora.split(':').map(Number);
        if (!dia || !mes || !anio || isNaN(horas) || isNaN(minutos)) return null;
        const fechaObj = new Date(anio, mes - 1, dia, horas, minutos);
        return isNaN(fechaObj.getTime()) ? null : fechaObj;
    } catch (e) {
        return null;
    }
}

function generarICS(fechaInicio, nombreCliente, descripcion, telefono) {
    const pad = (n) => n < 10 ? '0' + n : n;
    const formatICSDate = (date) => `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    const fechaFin = new Date(fechaInicio.getTime() + (2 * 60 * 60 * 1000)); 
    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SpicyInkk//TattooBot//EN
BEGIN:VEVENT
UID:${Date.now()}@spicyinkk
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(fechaInicio)}
DTEND:${formatICSDate(fechaFin)}
SUMMARY:Cita Estudio - ${nombreCliente}
DESCRIPTION:Tattoo: ${descripcion} | Tel: ${telefono}
END:VEVENT
END:VCALENDAR`;
}

// Diccionarios avanzados y mini-juegos de suerte
const diccionarioSimbolos = {
    'lobo': 'Lealtad absoluta, familia, protección y fuerza interior.',
    'león': 'Autoridad, coraje, liderazgo, poder y realeza.',
    'mariposa': 'Transformación profunda, renacimiento, evolución y libertad.',
    'reloj': 'El paso inexorable del tiempo, memento mori y valor del presente.',
    'brujula': 'Orientación vital, encontrar tu rumbo y protección en viajes.',
    'craneo': 'Aceptación de la mortalidad, igualdad y renacimiento.',
    'serpiente': 'Sabiduría, curación, transformación y dualidad.',
    'rosa': 'Amor eterno, pasión desbordada y belleza con espinas.',
    'dragon': 'Sabiduría ancestral, fuerza mítica, fortuna y protección.',
    'ancla': 'Estabilidad emocional, seguridad y firmeza en decisiones.'
};

const oraculoFrases = [
    "Los astros del estudio indican que tu energía pide un diseño Blackwork con alto contraste.",
    "Tu aura creativa resuena fuertemente con el estilo Fine Line y geometría sagrada.",
    "Es el momento perfecto para plasmar un diseño en honor a la naturaleza o flora.",
    "La energía fluye hacia una pieza de gran formato con estilo Neo-Tradicional.",
    "Un diseño minimalista de alto significado oculto equilibrará tu momento vital actual."
];

const bola8Respuestas = [
    "🎱 ¡Definitivamente SÍ! Ve a por ese diseño sin dudarlo.", 
    "🎱 Las vibras del estudio dicen que NO es el momento adecuado, espera un par de semanas.", 
    "🎱 Diseñalo ya mismo, el resultado superará tus expectativas.", 
    "🎱 Medítalo un mes más antes de pasar por la aguja.", 
    "🎱 Consulta directamente conmigo en cabina para evaluar viabilidad técnica."
];

// ==========================================
// 4. GENERADOR DE IMÁGENES PROFESIONALES (JIMP)
// ==========================================
async function crearImagenTarjetaRegalo(codigo, beneficiario, importe) {
    try {
        // Creamos un lienzo base profesional de 800x400 (Gift Card format)
        const width = 800;
        const height = 400;
        const image = new Jimp(width, height, '#121212');

        // Decoración visual mediante rectángulos y líneas con Jimp nativo
        image.scan(0, 0, width, height, (x, y, idx) => {
            // Añadir un sutil gradiente o textura de fondo oscura
            if (x < 10 || x > width - 10 || y < 10 || y > height - 10) {
                image.setPixelColor(Jimp.rgbaToInt(212, 175, 55, 255), x, y); // Bordes dorados VIP
            }
        });

        // Intentamos cargar fuente estándar para renderizar texto informativo
        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const fontSub = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        
        image.print(fontTitle, 50, 40, 'SPICYINKK - GIFT CARD VIP');
        image.print(fontSub, 50, 90, 'Estudio Profesional de Tatuaje');
        
        image.print(fontSub, 50, 160, `Beneficiario/a: ${beneficiario}`);
        image.print(fontSub, 50, 200, `Importe Canjeable: ${importe} EUR`);
        image.print(fontSub, 50, 260, `CÓDIGO ÚNICO DE CANJE:`);
        
        // Imprimir código grande
        const fontCode = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        image.print(fontCode, 50, 290, `${codigo}`);

        const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
        return buffer;
    } catch (err) {
        console.error('[JIMP GIFT CARD ERROR]:', err);
        return null;
    }
}

// ==========================================
// 5. WIZARDS Y ESCENAS INTERACTIVAS
// ==========================================
const tecladoCancelar = Markup.keyboard([['❌ Cancelar / Salir']]).resize();

// --- PROBADOR VIRTUAL AVANZADO ---
const probadorScene = new Scenes.WizardScene('probador-scene',
    (ctx) => {
        ctx.reply('🕶️ *PROBADOR VIRTUAL DE TATUAJES (PASO 1/2)*\n\nEnvía una fotografía clara de la zona de tu cuerpo donde deseas visualizar el diseño.', { parse_mode: 'Markdown', ...tecladoCancelar });
        ctx.wizard.state.probador = {};
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        if (!ctx.message || !ctx.message.photo) { 
            ctx.reply('❌ Por favor, adjunta una fotografía válida.'); 
            return; 
        }
        ctx.wizard.state.probador.bodyFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply('✅ Imagen de cuerpo recibida.\n\n*PASO 2/2*\nEnvía ahora la *IMAGEN DEL DISEÑO* de tatuaje (preferiblemente PNG nítido).', { parse_mode: 'Markdown' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        
        let designFileId;
        if (ctx.message && ctx.message.photo) {
            designFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message && ctx.message.document && ctx.message.document.mime_type && ctx.message.document.mime_type.startsWith('image/')) {
            designFileId = ctx.message.document.file_id;
        } else { 
            ctx.reply('❌ Formato de imagen no válido.'); 
            return; 
        }
        
        const loadingMsg = await ctx.reply('🎨 Procesando fusión realista de capas de piel y diseño...');
        
        try {
            const bodyUrl = await ctx.telegram.getFileLink(ctx.wizard.state.probador.bodyFileId);
            const designUrl = await ctx.telegram.getFileLink(designFileId);
            
            const bodyImage = await Jimp.read(bodyUrl.href);
            const designImage = await Jimp.read(designUrl.href);
            
            const targetWidth = bodyImage.bitmap.width * 0.40;
            designImage.resize(targetWidth, Jimp.AUTO);
            
            const x = (bodyImage.bitmap.width / 2) - (designImage.bitmap.width / 2);
            const y = (bodyImage.bitmap.height / 2) - (designImage.bitmap.height / 2);
            
            bodyImage.composite(designImage, x, y);
            const buffer = await bodyImage.getBufferAsync(Jimp.MIME_JPEG);
            
            await ctx.replyWithPhoto({ source: buffer }, { caption: '🖊️ *¡SIMULACIÓN COMPLETADA!*\nAsí es como luciría la pieza.', parse_mode: 'Markdown' });
            sumarPuntos(ctx.from.id, 2); // Recompensa por interactuar
            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
        } catch (error) { 
            console.error('[PROBADOR ERROR]:', error);
            ctx.reply('❌ Error técnico al procesar el probador virtual.'); 
        }
        return irAlMenuPrincipal(ctx);
    }
);

// --- TARJETA REGALO WIZARD CON GENERACIÓN DE IMAGEN ---
const regaloScene = new Scenes.WizardScene('regalo-scene',
    (ctx) => {
        ctx.reply('🎁 *CREACIÓN DE TARJETA REGALO VIP*\n\nIntroduce el *Nombre del beneficiario/a* de la tarjeta:', { parse_mode: 'Markdown', ...tecladoCancelar });
        ctx.wizard.state.regalo = {};
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.regalo.beneficiario = ctx.message.text.trim();
        ctx.reply('💶 Introduce el *Importe en Euros* (ej: 50, 100, 250):', { parse_mode: 'Markdown' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        const importe = ctx.message.text.trim();
        const beneficiario = ctx.wizard.state.regalo.beneficiario;
        
        // Generar código único verificable por el admin
        const codigoUnico = 'SPICY-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        db.tarjetasRegalo[codigoUnico] = {
            id: Date.now(),
            creadorId: ctx.from.id,
            beneficiario: beneficiario,
            importe: importe,
            canjeada: false,
            fecha: new Date().toISOString()
        };
        guardar();

        const waitMsg = await ctx.reply('🎨 Generando imagen oficial de la Gift Card...');
        
        try {
            const imgBuffer = await crearImagenTarjetaRegalo(codigoUnico, beneficiario, importe);
            if (imgBuffer) {
                await ctx.replyWithPhoto({ source: imgBuffer }, { 
                    caption: `🎁 *TARJETA REGALO GENERADA*\n\n👤 Para: *${beneficiario}*\n💰 Valor: *${importe} EUR*\n🔑 Código Único: \`${codigoUnico}\`\n\n_Guarda esta imagen o código. El estudio lo validará y canjeará directamente._`, 
                    parse_mode: 'Markdown' 
                });
            } else {
                await ctx.reply(`🎁 Código: \`${codigoUnico}\` - Importe: ${importe}€`);
            }
            sumarPuntos(ctx.from.id, 5); // Recompensa VIP
            await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        } catch (e) {
            console.error(e);
            ctx.reply(`✅ Tarjeta creada correctamente con código: \`${codigoUnico}\``, { parse_mode: 'Markdown' });
        }
        return irAlMenuPrincipal(ctx);
    }
);

// --- CITA WIZARD PROFESIONAL ---
const citaWizard = new Scenes.WizardScene('cita-wizard',
    (ctx) => { 
        ctx.reply('📅 *PROGRAMACIÓN DE NUEVA CITA*\n\nIntroduce el *ID de Telegram* del cliente:', { parse_mode: 'Markdown', ...tecladoCancelar }); 
        ctx.wizard.state.cita = {}; 
        return ctx.wizard.next(); 
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.cita.clienteId = ctx.message.text.trim(); 
        ctx.reply('👤 Introduce el *Nombre completo* del cliente:', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next(); 
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.cita.nombre = ctx.message.text.trim(); 
        ctx.reply('📞 Introduce el *Teléfono* de contacto:', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next(); 
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.wizard.state.cita.telefono = ctx.message.text.trim(); 
        ctx.reply('📆 Introduce fecha y hora:\nFormato: `DD/MM/YYYY HH:MM`', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next(); 
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        const f = parsearFecha(ctx.message.text);
        if (!f) {
            ctx.reply('❌ Formato incorrecto. Usa estrictamente: `DD/MM/YYYY HH:MM`', { parse_mode: 'Markdown' });
            return;
        }
        ctx.wizard.state.cita.timestamp = f.getTime();
        ctx.wizard.state.cita.fechaStr = ctx.message.text.trim();
        ctx.reply('💉 Describe el *Estilo y Detalles del Tatuaje*:', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        const st = ctx.wizard.state.cita;
        const desc = ctx.message.text.trim();
        
        const nuevaCita = { 
            id: Date.now(), 
            clienteId: st.clienteId, 
            nombre: st.nombre, 
            telefono: st.telefono, 
            fecha: st.timestamp, 
            fechaTexto: st.fechaStr, 
            descripcion: desc, 
            avisado24h: false 
        };
        
        db.citas.push(nuevaCita); 
        guardar();
        sumarPuntos(st.clienteId, 15); // Puntos VIP por reservar cita

        try { 
            await ctx.telegram.sendMessage(st.clienteId, `📅 *¡CITA CONFIRMADA EN SPICYINKK!*\n\nTe esperamos el *${st.fechaStr}*.\nDetalle: ${desc}`, { parse_mode: 'Markdown' }); 
        } catch(e){}
        
        const ics = generarICS(new Date(st.timestamp), st.nombre, desc, st.telefono);
        await ctx.replyWithDocument({ source: Buffer.from(ics), filename: 'cita-spicyinkk.ics' }, { caption: '✅ Cita registrada y archivo ICS generado.' });
        return irAlMenuPrincipal(ctx);
    }
);

// Otras escenas operativas
const tattooScene = new Scenes.WizardScene('tattoo-wizard', 
    (ctx) => { 
        notificarAdmin(ctx, 'Solicitud de Presupuesto Directo'); 
        ctx.reply('🔥 *PRESUPUESTO PERSONALIZADO*\n\nCuéntame tu idea, tamaño aproximado y zona del cuerpo:', { parse_mode: 'Markdown', ...tecladoCancelar }); 
        return ctx.wizard.next();
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.reply('✅ ¡Idea recibida con éxito! El estudio la evaluará y te contactará con un presupuesto detallado.'); 
        sumarPuntos(ctx.from.id, 3);
        return irAlMenuPrincipal(ctx);
    }
);

const cumpleScene = new Scenes.WizardScene('cumple-scene', 
    (ctx) => { 
        ctx.reply('📅 Introduce tu fecha de cumpleaños (`DD/MM`) para recibir sorpresas exclusivas VIP:', { parse_mode: 'Markdown', ...tecladoCancelar }); 
        return ctx.wizard.next(); 
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        db.cumples[ctx.from.id] = ctx.message.text.trim(); 
        guardar(); 
        ctx.reply('✅ ¡Fecha de cumpleaños registrada! Tienes 10 puntos VIP de bonificación.'); 
        sumarPuntos(ctx.from.id, 10);
        return irAlMenuPrincipal(ctx);
    }
);

const diccionarioScene = new Scenes.WizardScene('diccionario-scene', 
    (ctx) => { 
        ctx.reply('📚 *DICCIONARIO DE SIMBOLOGÍA*\n\nEscribe el concepto que deseas consultar (ej: lobo, mariposa, reloj):', { parse_mode: 'Markdown', ...tecladoCancelar }); 
        return ctx.wizard.next(); 
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        const query = ctx.message.text.trim().toLowerCase();
        const res = diccionarioSimbolos[query] || "No encontré ese símbolo exacto, pero podemos adaptarlo a tu diseño personalizado en el estudio.";
        ctx.reply(`📖 *${query.toUpperCase()}*: ${res}`, { parse_mode: 'Markdown' });
        return irAlMenuPrincipal(ctx);
    }
);

const panicoScene = new Scenes.WizardScene('panico-scene', 
    (ctx) => { 
        notificarAdmin(ctx, '⚠️ ALERTA: Botón Pánico Activado'); 
        ctx.reply('🚨 *URGENCIAS - PASO 1/3*\n¿Notas la zona excesivamente caliente al tacto? (Sí / No)', { parse_mode: 'Markdown', ...tecladoCancelar }); 
        return ctx.wizard.next(); 
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.reply('🚨 *PASO 2/3*\n¿Observas secreción purulenta o mal olor? (Sí / No)', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next(); 
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.reply('🚨 *PASO 3/3*\n¿Tienes fiebre o malestar general? (Sí / No)', { parse_mode: 'Markdown' }); 
        return ctx.wizard.next(); 
    }, 
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        ctx.reply('🏥 *PROTOCOLO DE URGENCIAS*\nLava suavemente con jabón neutro y agua templada. Si persisten los síntomas, acude a tu centro médico de confianza. El estudio ha sido advertido.', { parse_mode: 'Markdown' }); 
        return irAlMenuPrincipal(ctx);
    }
);

// Escena para canjear tarjetas desde admin o cliente
const canjearGiftScene = new Scenes.WizardScene('canje-gift-scene',
    (ctx) => {
        if (ctx.from.id.toString() !== MI_ID.toString()) {
            ctx.reply('Acceso denegado.');
            return irAlMenuPrincipal(ctx);
        }
        ctx.reply('🎟️ *CANJEAR TARJETA REGALO*\n\nIntroduce el código único de la tarjeta (ej: SPICY-XXXXXX):', { parse_mode: 'Markdown', ...tecladoCancelar });
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message && ctx.message.text === '❌ Cancelar / Salir') return irAlMenuPrincipal(ctx);
        const codigo = ctx.message.text.trim().toUpperCase();
        
        if (!db.tarjetasRegalo[codigo]) {
            ctx.reply('❌ El código introducido no existe en el sistema.');
        } else if (db.tarjetasRegalo[codigo].canjeada) {
            ctx.reply('⚠️ Esta tarjeta regalo YA FUE CANJEADA anteriormente.');
        } else {
            db.tarjetasRegalo[codigo].canjeada = true;
            guardar();
            ctx.reply(`✅ *¡TARJETA CANJEADA CON ÉXITO!* 🎉\n\nBeneficiario: ${db.tarjetasRegalo[codigo].beneficiario}\nImporte: ${db.tarjetasRegalo[codigo].importe} EUR`, { parse_mode: 'Markdown' });
        }
        return irAlMenuPrincipal(ctx);
    }
);

const mineScene = new Scenes.BaseScene('mine-scene'); 
mineScene.enter(ctx => { 
    notificarAdmin(ctx, 'Minando Puntos VIP'); 
    ctx.reply('💉 *ZONA DE MINERÍA VIP*\nEstás minando tinta y puntos de fidelización activos.', { parse_mode: 'Markdown', ...tecladoCancelar }); 
});
mineScene.hears('❌ Cancelar / Salir', ctx => irAlMenuPrincipal(ctx));

bot.hears('❌ Cancelar / Salir', (ctx) => {
    if (ctx.scene) ctx.scene.leave();
    return irAlMenuPrincipal(ctx);
});

// ==========================================
// 6. REGISTRO DE ESCENAS Y MIDDLEWARES
// ==========================================
const stage = new Scenes.Stage([
    tattooScene, mineScene, regaloScene, cumpleScene, 
    citaWizard, probadorScene, diccionarioScene, panicoScene, canjearGiftScene
]);

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    notificarAdmin(ctx, 'Inicio de Sesión / Bot Start');
    
    const text = ctx.message.text;
    if (text && text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId && inviterId !== ctx.from.id.toString() && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1;
            sumarPuntos(inviterId, 10); // Recompensa por referido exitoso
            guardar();
            bot.telegram.sendMessage(inviterId, `👥 ¡Nuevo referido detectado! Has ganado +10 puntos VIP en tu cuenta.`).catch(()=>{});
        }
    }
    return irAlMenuPrincipal(ctx);
});

function irAlMenuPrincipal(ctx) {
    if (db.mantenimiento && ctx.from.id.toString() !== MI_ID.toString()) {
        return ctx.reply('🛠️ El bot se encuentra en mantenimiento técnico.');
    }
    
    const botones = [
        ['🔥 Cita / Presupuesto', '🎮 Zona Fun'],
        ['🚑 SOS & Cuidados', '💎 Club VIP'],
        ['🎁 Tarjetas Regalo', '👤 Mi Perfil']
    ];
    
    if (ctx.from.id.toString() === MI_ID.toString()) {
        botones.push(['📊 Panel Admin']);
    }
    
    return ctx.reply(`✨ *SPICYINKK - ESTUDIO DE TATUAJE PROFESIONAL* ✨\nSelecciona una opción de nuestro sistema interactivo:`, { 
        parse_mode: 'Markdown', 
        ...Markup.keyboard(botones).resize() 
    });
}

// ==========================================
// 7. ENRUTAMIENTO DE INTERFAZ Y MINIGAMES
// ==========================================
bot.hears('🔥 Cita / Presupuesto', (ctx) => {
    notificarAdmin(ctx, 'Seleccionó Cita / Presupuesto');
    return ctx.scene.enter('tattoo-wizard');
});

bot.hears('🎮 Zona Fun', (ctx) => {
    notificarAdmin(ctx, 'Entró en Zona Fun');
    return ctx.reply('🎢 *MINIAPPS & SUERTES EN TATUAJES*', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['🎰 Ruleta de la Tinta', '🔮 Oráculo Tattoo'], 
            ['🎱 Bola 8 Mística', '📚 Diccionario Símbolos'], 
            ['🕶️ Probador 2.0', '⬅️ Volver']
        ]).resize()
    });
});

bot.hears('🚑 SOS & Cuidados', (ctx) => {
    notificarAdmin(ctx, 'Consultó SOS & Cuidados');
    return ctx.reply('🏥 *GUÍA DE CURAS Y URGENCIAS*', {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            ['🚨 PÁNICO', '⏰ Alarma Crema'], 
            ['🩸 Dolor', '🧼 Guía'], 
            ['⬅️ Volver']
        ]).resize()
    });
});

bot.hears('💎 Club VIP', (ctx) => {
    notificarAdmin(ctx, 'Accedió al Club VIP');
    const uid = ctx.from.id;
    const pts = db.puntos[uid] || 0;
    const nivel = db.usuarios[uid]?.nivelVIP || 'Bronce 🥉';
    const linkReferido = `https://t.me/${ctx.botInfo.username}?start=${uid}`;
    
    return ctx.reply(`💎 *CLUB DE FIDELIZACIÓN VIP*\n\n👤 Rango actual: *${nivel}*\n⭐ Puntos acumulados: *${pts} pts*\n\n🔗 *Tu enlace de referido personal:* \n\`${linkReferido}\`\n*(Comparte este enlace y gana 10 puntos por cada amigo que inicie el bot)*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📅 Registrar Mi Cumple', 'set_cumple')],
            [Markup.button.callback('💉 Zona Minería', 'ir_minar')]
        ])
    });
});

bot.hears('🎁 Tarjetas Regalo', (ctx) => {
    notificarAdmin(ctx, 'Inició Tarjetas Regalo');
    return ctx.scene.enter('regalo-scene');
});

bot.hears('👤 Mi Perfil', (ctx) => {
    notificarAdmin(ctx, 'Consultó Perfil de Usuario');
    const u = ctx.from;
    const pts = db.puntos[u.id] || 0;
    const nivel = db.usuarios[u.id]?.nivelVIP || 'Bronce 🥉';
    const citasCount = db.citas.filter(c => c.clienteId == u.id).length;
    
    return ctx.reply(`👤 *PERFIL DE USUARIO VIP*\n\n🆔 ID: \`${u.id}\`\n📛 Nombre: ${u.first_name}\n💎 Nivel VIP: ${nivel}\n⭐ Puntos: ${pts}\n📅 Citas agendadas: ${citasCount}`, { parse_mode: 'Markdown' });
});

// --- MINIGAMES & SUERTES ---
bot.hears('🎰 Ruleta de la Tinta', (ctx) => {
    notificarAdmin(ctx, 'Jugó Ruleta de la Tinta');
    const uid = ctx.from.id; 
    const hoy = new Date().toDateString();
    if (db.ultima_ruleta[uid] === hoy) {
        return ctx.reply('🛑 Ya has tirado de la ruleta hoy. Vuelve mañana para probar suerte de nuevo.');
    }
    db.ultima_ruleta[uid] = hoy;
    const r = Math.random();
    if (r < 0.25) { 
        sumarPuntos(uid, -2);
        ctx.reply('💣 ¡Mala suerte! Has perdido 2 puntos VIP.'); 
    } else if (r < 0.6) { 
        sumarPuntos(uid, 5);
        ctx.reply('🎰 ¡Premio excelente! Has ganado +5 puntos VIP.'); 
    } else { 
        sumarPuntos(uid, 2);
        ctx.reply('✨ ¡Premio menor! +2 puntos VIP añadidos a tu cuenta.'); 
    }
});

bot.hears('🔮 Oráculo Tattoo', (ctx) => { 
    notificarAdmin(ctx, 'Consultó Oráculo Tattoo'); 
    const frase = oraculoFrases[Math.floor(Math.random() * oraculoFrases.length)];
    sumarPuntos(ctx.from.id, 1);
    return ctx.reply(`🔮 *ORÁCULO SPICYINKK*\n\n"${frase}"`, { parse_mode: 'Markdown' }); 
});

bot.hears('🎱 Bola 8 Mística', (ctx) => { 
    notificarAdmin(ctx, 'Consultó Bola 8 Mística'); 
    const respuesta = bola8Respuestas[Math.floor(Math.random() * bola8Respuestas.length)];
    return ctx.reply(respuesta); 
});

bot.hears('🩸 Dolor', (ctx) => { 
    notificarAdmin(ctx, 'Consultó Mapa de Dolor'); 
    return ctx.reply('🩸 Selecciona una zona para estimar el índice relativo de dolor en cabina:', Markup.inlineKeyboard([
        [Markup.button.callback('Costillas (Alto 9/10)', 'd_9'), Markup.button.callback('Antebrazo (Moderado 3/10)', 'd_3')]
    ])); 
});

bot.action(/d_(\d)/, (ctx) => {
    ctx.answerCbQuery(`Nivel de dolor estimado: ${ctx.match[1]}/10`, { show_alert: true });
});

bot.hears('⏰ Alarma Crema', (ctx) => { 
    notificarAdmin(ctx, 'Toggle Alarma Crema'); 
    const uid = ctx.from.id;
    if (db.alarmas[uid]) { 
        delete db.alarmas[uid]; 
        ctx.reply('🔕 Alarma de hidratación desactivada.'); 
    } else { 
        db.alarmas[uid] = Date.now(); 
        ctx.reply('🔔 Alarma configurada. Te avisaremos cada 4 horas para el correcto cuidado.'); 
    }
    guardar();
});

bot.hears('📚 Diccionario Símbolos', (ctx) => { 
    notificarAdmin(ctx, 'Accedió al Diccionario'); 
    return ctx.scene.enter('diccionario-scene'); 
});

bot.hears('🚨 PÁNICO', (ctx) => { 
    return ctx.scene.enter('panico-scene'); 
});

bot.hears('🕶️ Probador 2.0', (ctx) => { 
    notificarAdmin(ctx, 'Accedió a Probador 2.0'); 
    return ctx.scene.enter('probador-scene'); 
});

bot.action('set_cumple', (ctx) => { 
    ctx.answerCbQuery(); 
    return ctx.scene.enter('cumple-scene'); 
});

bot.action('ir_minar', (ctx) => { 
    ctx.answerCbQuery(); 
    return ctx.scene.enter('mine-scene'); 
});

bot.hears('⬅️ Volver', (ctx) => irAlMenuPrincipal(ctx));

bot.hears('🧼 Guía', (ctx) => { 
    notificarAdmin(ctx, 'Consultó Guía de Cuidados'); 
    return ctx.reply('🧼 *GUÍA DE CUIDADOS PROFESIONAL*\n\n1. Lava con agua templada y jabón ph neutro 3 veces al día.\n2. Seca dando suaves toques con papel absorbente limpio.\n3. Aplica crema específica en capa muy fina.'); 
});

// ==========================================
// 8. PANEL DE ADMINISTRACIÓN AVANZADO
// ==========================================
bot.hears('📊 Panel Admin', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    return ctx.reply('🛠️ *PANEL DE ADMINISTRACIÓN CENTRAL*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('👥 Ver Usuarios VIP', 'admin_usuarios'), Markup.button.callback('📅 Nueva Cita', 'admin_cita')],
            [Markup.button.callback('🗓️ Ver Citas Activas', 'admin_calendario'), Markup.button.callback('🎟️ Canjear Gift Card', 'admin_canjear')]
        ])
    });
});

bot.action('admin_usuarios', async (ctx) => {
    const totalUsuarios = Object.keys(db.usuarios).length;
    await ctx.reply(`👥 Total de usuarios fidelizados en base de datos: *${totalUsuarios}*`, { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
});

bot.action('admin_calendario', async (ctx) => {
    if (db.citas.length === 0) {
        await ctx.reply('📅 No hay citas programadas actualmente.');
    } else {
        let txt = '📅 *LISTADO DE CITAS ACTIVAS*\n\n';
        db.citas.forEach((c, idx) => {
            txt += `${idx + 1}. *${c.nombre}* (${c.telefono})\n   Fecha: ${c.fechaTexto}\n   Detalle: ${c.descripcion}\n\n`;
        });
        await ctx.reply(txt, { parse_mode: 'Markdown' });
    }
    ctx.answerCbQuery();
});

bot.action('admin_cita', (ctx) => {
    ctx.answerCbQuery();
    return ctx.scene.enter('cita-wizard');
});

bot.action('admin_canjear', (ctx) => {
    ctx.answerCbQuery();
    return ctx.scene.enter('canje-gift-scene');
});

// ==========================================
// 9. TAREAS CRON EN SEGUNDO PLANO
// ==========================================
setInterval(() => {
    const ahora = Date.now();
    const UN_DIA = 86400000;
    
    db.citas.forEach(c => {
        const rest = c.fecha - ahora;
        if (!c.avisado24h && rest > 0 && rest <= UN_DIA && rest > (UN_DIA - 600000)) {
            bot.telegram.sendMessage(c.clienteId, `⏰ *RECORDATORIO DE CITA*\nMañana te esperamos en SpicyInkk a las ${c.fechaTexto}.`, { parse_mode: 'Markdown' }).catch(()=>{});
            bot.telegram.sendMessage(MI_ID, `🔔 *Aviso Cita Mañana*\nCliente: ${c.nombre} (${c.telefono})`).catch(()=>{});
            c.avisado24h = true; 
            guardar();
        }
    });

    Object.keys(db.alarmas).forEach(uid => {
        const diff = ahora - db.alarmas[uid];
        if (diff % 14400000 < 60000 && diff > 1000) {
            bot.telegram.sendMessage(uid, '🧴 *ALARMA DE HIDRATACIÓN*\nEs momento de lavar tu tatuaje y aplicar tu crema.', { parse_mode: 'Markdown' }).catch(()=>{});
        }
    });
}, 60000);

// ==========================================
// 10. LANZAMIENTO DEL BOT
// ==========================================
bot.launch().then(() => {
    console.log('🚀 SpicyInkk Bot Ultimate Edition desplegado y operando profesionalmente.');
}).catch((err) => {
    console.error('[FATAL ERROR]:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
