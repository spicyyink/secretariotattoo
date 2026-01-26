require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online - V6.0 (Notificaciones Admin) ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor HTTP activo en puerto ${PORT}`);
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS LOCAL
// ==========================================
let db = { 
    clics: {}, referidos: {}, confirmados: {}, invitados: {}, 
    fichas: {}, puntos: {}, cupones: {}, citas: [], 
    alarmas: {}, cumples: {}, ultima_ruleta: {}, 
    mantenimiento: false 
};
const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.citas) db.citas = [];
        if (!db.alarmas) db.alarmas = {};
        if (!db.cumples) db.cumples = {};
        if (!db.ultima_ruleta) db.ultima_ruleta = {};
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. UTILIDADES (Y NOTIFICADOR NUEVO)
// ==========================================

// --- NUEVA FUNCIÓN DE NOTIFICACIÓN ---
const notificarAdmin = (ctx, accion) => {
    // No notificar si eres tú mismo quien toca los botones
    if (ctx.from.id.toString() !== MI_ID.toString()) {
        const usuario = ctx.from.first_name || "Desconocido";
        const id = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : "Sin alias";
        
        bot.telegram.sendMessage(MI_ID, `🔔 **ACTIVIDAD DETECTADA**\n\n👤 **Usuario:** ${usuario} (${username})\n🆔 **ID:** \`${id}\`\n🔘 **Acción:** ${accion}`, { parse_mode: 'Markdown' }).catch(err => console.log("Error notificando admin"));
    }
};

function parsearFecha(texto) {
    const [fecha, hora] = texto.split(' ');
    const [dia, mes, anio] = fecha.split('/').map(Number);
    const [horas, minutos] = hora.split(':').map(Number);
    return new Date(anio, mes - 1, dia, horas, minutos);
}

function generarICS(fechaInicio, nombreCliente, descripcion, telefono) {
    const pad = (n) => n < 10 ? '0' + n : n;
    const formatICSDate = (date) => `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
    const fechaFin = new Date(fechaInicio.getTime() + (2 * 60 * 60 * 1000)); 
    const descripcionFull = `${descripcion}\\n📞 Tel: ${telefono}`;
    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SpicyInk//TattooBot//EN
BEGIN:VEVENT
UID:${Date.now()}@spicyink
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(fechaInicio)}
DTEND:${formatICSDate(fechaFin)}
SUMMARY:Tatuaje con ${nombreCliente}
DESCRIPTION:${descripcionFull}
BEGIN:VALARM
TRIGGER:-PT24H
DESCRIPTION:Recordatorio de Tatuaje
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

// Diccionarios
const diccionarioSimbolos = {
    'lobo': 'Lealtad, familia, protección y fuerza interior.',
    'león': 'Autoridad, coraje, poder y realeza.',
    'mariposa': 'Transformación, renacimiento y libertad.',
    'reloj': 'El paso del tiempo, la mortalidad (Memento Mori).',
    'brujula': 'Orientación, búsqueda de camino.',
    'craneo': 'Aceptación de la muerte, igualdad.',
    'serpiente': 'Curación, renacimiento, dualidad.',
    'rosa': 'Amor, pasión y dolor.',
    'dragon': 'Sabiduría, fuerza y suerte.',
    'ancla': 'Estabilidad y seguridad.'
};

const oraculoFrases = [
    "Los astros indican que necesitas algo 'Old School'.",
    "Tu aura pide a gritos un diseño Geométrico.",
    "Es un buen momento para tatuarte naturaleza.",
    "La energía fluye hacia el Blackwork pesado.",
    "Un diseño minimalista te equilibrará hoy."
];

const bola8Respuestas = [
    "🎱 Definitivamente SÍ.", "🎱 Mis fuentes dicen que NO.", 
    "🎱 Hazlo, no te arrepentirás.", "🎱 Mejor espera un mes.",
    "🎱 Pregunta de nuevo cuando tengas el diseño claro."
];

// ==========================================
// 4. ESCENAS
// ==========================================

// --- PROBADOR VIRTUAL (2 FOTOS) ---
const probadorScene = new Scenes.WizardScene('probador-scene',
    (ctx) => {
        ctx.reply('🕶️ **PROBADOR VIRTUAL**\n1️⃣ Envía una **FOTO DE TU CUERPO**.');
        ctx.wizard.state.probador = {};
        return ctx.wizard.next();
    },
    (ctx) => {
        if (!ctx.message || !ctx.message.photo) { ctx.reply('❌ Envía una foto.'); return; }
        ctx.wizard.state.probador.bodyFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        ctx.reply('✅ Recibido.\n2️⃣ Ahora envía la **IMAGEN DEL DISEÑO** (Mejor si es archivo PNG).');
        return ctx.wizard.next();
    },
    async (ctx) => {
        let designFileId;
        if (ctx.message.photo) designFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        else if (ctx.message.document && ctx.message.document.mime_type.startsWith('image/')) designFileId = ctx.message.document.file_id;
        else { ctx.reply('❌ Necesito imagen.'); return; }
        
        ctx.reply('🎨 **Fusionando...**');
        try {
            const bodyUrl = await ctx.telegram.getFileLink(ctx.wizard.state.probador.bodyFileId);
            const designUrl = await ctx.telegram.getFileLink(designFileId);
            const bodyImage = await Jimp.read(bodyUrl.href);
            const designImage = await Jimp.read(designUrl.href);
            const targetWidth = bodyImage.bitmap.width * 0.45;
            designImage.resize(targetWidth, Jimp.AUTO);
            const x = (bodyImage.bitmap.width / 2) - (designImage.bitmap.width / 2);
            const y = (bodyImage.bitmap.height / 2) - (designImage.bitmap.height / 2);
            bodyImage.composite(designImage, x, y);
            const buffer = await bodyImage.getBufferAsync(Jimp.MIME_JPEG);
            await ctx.replyWithPhoto({ source: buffer }, { caption: '🖊️ **¡ASÍ QUEDARÍA!**' });
        } catch (error) { ctx.reply('❌ Error procesando imágenes.'); }
        return ctx.scene.leave();
    }
);

// --- OTRAS ESCENAS ---
const citaWizard = new Scenes.WizardScene('cita-wizard',
    (ctx) => { ctx.reply('📅 **NUEVA CITA**\nID Cliente:'); ctx.wizard.state.cita = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.cita.clienteId = ctx.message.text.trim(); ctx.reply('👤 Nombre:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.cita.nombre = ctx.message.text; ctx.reply('📞 Teléfono:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.cita.telefono = ctx.message.text; ctx.reply('📆 Fecha (DD/MM/YYYY HH:MM):'); return ctx.wizard.next(); },
    (ctx) => {
        try {
            const f = parsearFecha(ctx.message.text);
            if (isNaN(f.getTime())) throw new Error();
            ctx.wizard.state.cita.timestamp = f.getTime();
            ctx.wizard.state.cita.fechaStr = ctx.message.text;
            ctx.reply('💉 Tatuaje:'); return ctx.wizard.next();
        } catch (e) { ctx.reply('❌ Fecha mal.'); return; }
    },
    async (ctx) => {
        const st = ctx.wizard.state.cita;
        const nc = { id: Date.now(), clienteId: st.clienteId, nombre: st.nombre, telefono: st.telefono, fecha: st.timestamp, fechaTexto: st.fechaStr, descripcion: ctx.message.text, avisado24h: false };
        db.citas.push(nc); guardar();
        try { await ctx.telegram.sendMessage(st.clienteId, `📅 **CITA CONFIRMADA**\n${st.nombre}, te esperamos el ${st.fechaTexto}`); } catch(e){}
        const ics = generarICS(new Date(st.timestamp), st.nombre, ctx.message.text, st.telefono);
        await ctx.replyWithDocument({ source: Buffer.from(ics), filename: 'cita.ics' }, { caption: '✅ Cita creada' });
        return ctx.scene.leave();
    }
);

const simpleWizard = (name, text, cb) => new Scenes.WizardScene(name, (ctx) => { ctx.reply(text); return ctx.wizard.next(); }, cb);
const couponScene = simpleWizard('coupon-wizard', 'Código cupón:', (ctx) => { db.cupones[ctx.message.text] = 50; guardar(); ctx.reply('Hecho'); return ctx.scene.leave(); });
const broadcastScene = simpleWizard('broadcast-wizard', 'Mensaje a todos:', async (ctx) => { ctx.reply('Enviando...'); return ctx.scene.leave(); });
const reminderScene = simpleWizard('reminder-wizard', 'ID Usuario:', async (ctx) => { ctx.reply('Enviado'); return ctx.scene.leave(); });
const tattooScene = new Scenes.WizardScene('tattoo-wizard', 
    (ctx)=>{ notificarAdmin(ctx, 'Entró a Presupuesto'); ctx.reply('Escribe tu nombre:'); return ctx.wizard.next()}, 
    (ctx)=>{ctx.reply('Solicitud recibida.'); return ctx.scene.leave()}
);
const iaScene = new Scenes.WizardScene('ia-wizard', 
    (ctx)=>{ notificarAdmin(ctx, 'Usando IA'); ctx.reply('Describe tu tattoo:'); return ctx.wizard.next()}, 
    (ctx)=>{ctx.reply('Idea generada!'); return ctx.scene.leave()}
);
const mineScene = new Scenes.BaseScene('mine-scene'); mineScene.enter(ctx => { notificarAdmin(ctx, 'Minando Tinta'); ctx.reply('Minando... pulsa /start para salir'); });
const diccionarioScene = new Scenes.WizardScene('diccionario-scene', (ctx) => { ctx.reply('📚 Símbolo:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Significado...'); return ctx.scene.leave(); });
const panicoScene = new Scenes.WizardScene('panico-scene', (ctx) => { notificarAdmin(ctx, '⚠️ ALERTA: Botón Pánico'); ctx.reply('1. ¿Calor?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('2. ¿Pus?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('3. ¿Fiebre?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Resultado...'); return ctx.scene.leave(); });
const regaloScene = new Scenes.WizardScene('regalo-scene', (ctx) => { ctx.reply('Nombre:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Importe:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Gift Card generada.'); return ctx.scene.leave(); });
const cumpleScene = new Scenes.WizardScene('cumple-scene', (ctx) => { ctx.reply('Fecha DD/MM:'); return ctx.wizard.next(); }, (ctx) => { db.cumples[ctx.from.id] = ctx.message.text; guardar(); ctx.reply('Guardado'); return ctx.scene.leave(); });

// ==========================================
// 5. REGISTRO Y MENÚS
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, iaScene, couponScene, broadcastScene, reminderScene, citaWizard, probadorScene, diccionarioScene, panicoScene, regaloScene, cumpleScene]);
bot.use(session());
bot.use(stage.middleware());

// --- START CON NOTIFICACIÓN ---
bot.start((ctx) => {
    // 1. Notificar al Admin
    notificarAdmin(ctx, '🚀 START (Nuevo Usuario o Reinicio)');
    
    // 2. Lógica de referidos
    const text = ctx.message.text;
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != ctx.from.id && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1;
            guardar();
            bot.telegram.sendMessage(inviterId, `👥 ¡Alguien se ha unido con tu enlace!`).catch(()=>{});
        }
    }
    return irAlMenuPrincipal(ctx);
});

function irAlMenuPrincipal(ctx) {
    if (db.mantenimiento && ctx.from.id.toString() !== MI_ID.toString()) return ctx.reply('🛠️ Mantenimiento.');
    const botones = [
        ['🔥 Cita / Presupuesto', '🎮 Zona Fun'],
        ['🚑 SOS & Cuidados', '💎 Club VIP'],
        ['🎁 Tarjetas Regalo', '👤 Mi Perfil']
    ];
    if (ctx.from.id.toString() === MI_ID.toString()) botones.push(['📊 Panel Admin']);
    return ctx.reply(`✨ MENÚ PRINCIPAL ✨`, Markup.keyboard(botones).resize());
}

// --- HANDLERS CON NOTIFICACIÓN ---
bot.hears('🔥 Cita / Presupuesto', (ctx) => {
    notificarAdmin(ctx, '🔥 Cita / Presupuesto');
    ctx.scene.enter('tattoo-wizard');
});

bot.hears('🎮 Zona Fun', (ctx) => {
    notificarAdmin(ctx, '🎮 Zona Fun');
    ctx.reply('🎢 **ZONA FUN**', Markup.keyboard([['🎰 Ruleta', '🔮 Oráculo'], ['🎱 Bola 8', '📚 Diccionario'], ['🕶️ Probador 2.0', '⬅️ Volver']]).resize());
});

bot.hears('🚑 SOS & Cuidados', (ctx) => {
    notificarAdmin(ctx, '🚑 SOS & Cuidados');
    ctx.reply('🏥 **CUIDADOS**', Markup.keyboard([['🚨 PÁNICO', '⏰ Alarma Crema'], ['🩸 Dolor', '🧼 Guía'], ['⬅️ Volver']]).resize());
});

bot.hears('💎 Club VIP', (ctx) => {
    notificarAdmin(ctx, '💎 Club VIP');
    const pts = db.puntos[ctx.from.id] || 0;
    ctx.reply(`💎 **PUNTOS:** ${pts}`, Markup.inlineKeyboard([[Markup.button.callback('📅 Mi Cumple', 'set_cumple')], [Markup.button.callback('💉 Minar', 'ir_minar')]]));
});

bot.hears('🎁 Tarjetas Regalo', (ctx) => {
    notificarAdmin(ctx, '🎁 Tarjetas Regalo');
    ctx.scene.enter('regalo-scene');
});

bot.hears('👤 Mi Perfil', (ctx) => {
    notificarAdmin(ctx, '👤 Mi Perfil');
    const u = ctx.from;
    const pts = db.puntos[u.id] || 0;
    const citas = db.citas.filter(c => c.clienteId == u.id).length;
    ctx.reply(`👤 **MI PERFIL**\n\n🆔 ID: \`${u.id}\`\n📛 Nombre: ${u.first_name}\n💎 Puntos: ${pts}\n📅 Citas: ${citas}`, {parse_mode: 'Markdown'});
});

// --- LÓGICA INTERNA (SUBMENÚS) ---
bot.hears('🎰 Ruleta', (ctx) => {
    notificarAdmin(ctx, '🎰 Jugando Ruleta');
    const uid = ctx.from.id; const hoy = new Date().toDateString();
    if (db.ultima_ruleta[uid] === hoy) return ctx.reply('🛑 Ya jugaste hoy.');
    db.ultima_ruleta[uid] = hoy;
    const r = Math.random();
    if (r < 0.2) { db.puntos[uid] = Math.max(0, (db.puntos[uid]||0)-2); ctx.reply('💣 -2 pts'); }
    else if (r < 0.5) { db.puntos[uid] = (db.puntos[uid]||0)+5; ctx.reply('🎰 +5 pts'); }
    else ctx.reply('💨 Nada.');
    guardar();
});

bot.hears('🩸 Dolor', (ctx) => { notificarAdmin(ctx, '🩸 Mirando Dolor'); ctx.reply('Zona:', Markup.inlineKeyboard([[Markup.button.callback('Costillas', 'd_9'), Markup.button.callback('Brazo', 'd_3')]])); });
bot.action(/d_(\d)/, (ctx) => ctx.answerCbQuery(`Nivel ${ctx.match[1]}/10`, { show_alert: true }));
bot.hears('🔮 Oráculo', (ctx) => { notificarAdmin(ctx, '🔮 Oráculo'); ctx.reply(`🔮 ${oraculoFrases[Math.floor(Math.random()*oraculoFrases.length)]}`); });
bot.hears('🎱 Bola 8', (ctx) => { notificarAdmin(ctx, '🎱 Bola 8'); ctx.reply(bola8Respuestas[Math.floor(Math.random()*bola8Respuestas.length)]); });
bot.hears('⏰ Alarma Crema', (ctx) => { 
    notificarAdmin(ctx, '⏰ Alarma Crema Toggle');
    const uid = ctx.from.id;
    if (db.alarmas[uid]) { delete db.alarmas[uid]; ctx.reply('🔕 Alarma OFF'); }
    else { db.alarmas[uid] = Date.now(); ctx.reply('🔔 Alarma ON (Cada 4h)'); }
    guardar();
});
bot.hears('📚 Diccionario', (ctx) => { notificarAdmin(ctx, '📚 Diccionario'); ctx.scene.enter('diccionario-scene'); });
bot.hears('🚨 PÁNICO', (ctx) => { notificarAdmin(ctx, '🚨⚠️ BOTÓN PÁNICO USADO'); ctx.scene.enter('panico-scene'); });
bot.hears('🕶️ Probador 2.0', (ctx) => { notificarAdmin(ctx, '🕶️ Probador 2.0'); ctx.scene.enter('probador-scene'); });
bot.action('set_cumple', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('cumple-scene'); });
bot.action('ir_minar', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('mine-scene'); });
bot.hears('⬅️ Volver', (ctx) => irAlMenuPrincipal(ctx));
bot.hears('🧼 Guía', (ctx) => { notificarAdmin(ctx, '🧼 Guía Cuidados'); ctx.reply('Lavar, Secar, Crema. 3 veces/día.'); });

// Panel Admin (sin notificar porque eres tú)
bot.hears('📊 Panel Admin', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    return ctx.reply('🛠️ **PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('👥 Lista', 'admin_usuarios'), Markup.button.callback('📅 Nueva Cita', 'admin_cita')],
        [Markup.button.callback('🗓️ Calendario', 'admin_calendario'), Markup.button.callback('📢 Difusión', 'admin_broadcast')]
    ]));
});

// Acciones Admin
bot.action('admin_usuarios', async (ctx) => { const ids = [...new Set([...Object.keys(db.puntos), ...Object.keys(db.fichas)])]; ctx.reply(`Usuarios: ${ids.length}`); ctx.answerCbQuery(); });
bot.action('admin_calendario', async (ctx) => { ctx.reply('Ver calendario...'); ctx.answerCbQuery(); });
bot.action('admin_cita', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('cita-wizard'); });
bot.action('admin_broadcast', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('broadcast-wizard'); });

// Cron
setInterval(() => {
    const ahora = Date.now();
    const UN_DIA = 86400000;
    db.citas.forEach(c => {
        const rest = c.fecha - ahora;
        if (!c.avisado24h && rest > 0 && rest <= UN_DIA && rest > (UN_DIA - 600000)) {
            bot.telegram.sendMessage(c.clienteId, `⏰ Mañana cita: ${c.fechaTexto}`).catch(()=>{});
            bot.telegram.sendMessage(MI_ID, `🔔 Cita mañana: ${c.nombre}`).catch(()=>{});
            c.avisado24h = true; guardar();
        }
    });
    Object.keys(db.alarmas).forEach(uid => {
        const diff = ahora - db.alarmas[uid];
        if (diff % 14400000 < 60000 && diff > 1000) bot.telegram.sendMessage(uid, '🧴 Hora de la crema').catch(()=>{});
    });
}, 60000);

bot.launch().then(() => console.log('🚀 SpicyInk V6.0 (Notificaciones Activas)'));
