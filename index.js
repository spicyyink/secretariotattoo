require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR Y WEB APP
// ==========================================
const URL_WEB = process.env.RENDER_EXTERNAL_URL || 'https://TU-PROYECTO.onrender.com'; 

const HTML_RULETA = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Ruleta Spicy Ink</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { background-color: #1a1a1a; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
        #wheel-container { position: relative; width: 300px; height: 300px; }
        canvas { width: 100%; height: 100%; transform: rotate(-90deg); }
        #pointer { position: absolute; top: 50%; right: -15px; transform: translateY(-50%); width: 0; height: 0; border-top: 15px solid transparent; border-bottom: 15px solid transparent; border-right: 30px solid white; }
        button { margin-top: 30px; padding: 15px 40px; font-size: 20px; font-weight: bold; background: #ff4757; color: white; border: none; border-radius: 50px; cursor: pointer; box-shadow: 0 5px 15px rgba(255, 71, 87, 0.4); transition: transform 0.2s; }
        button:active { transform: scale(0.95); }
        button:disabled { background: #555; cursor: not-allowed; }
        h2 { margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px; }
    </style>
</head>
<body>
    <h2>🍀 Suerte 🍀</h2>
    <div id="wheel-container">
        <canvas id="wheel" width="500" height="500"></canvas>
        <div id="pointer"></div>
    </div>
    <button id="spinBtn">GIRAR</button>

    <script>
        const tg = window.Telegram.WebApp;
        tg.expand();

        const canvas = document.getElementById('wheel');
        const ctx = canvas.getContext('2d');
        const spinBtn = document.getElementById('spinBtn');

        const segments = [
            { text: "100% DTO", color: "#FFD700", weight: 3 },
            { text: "SIGUE JUGANDO", color: "#2f3542", weight: 67 },
            { text: "50% DTO", color: "#a4b0be", weight: 20 },
            { text: "SIGUE JUGANDO", color: "#2f3542", weight: 67 },
            { text: "20% DTO", color: "#cd6133", weight: 30 },
            { text: "SIGUE JUGANDO", color: "#2f3542", weight: 67 }
        ];
        
        const totalWeight = segments.reduce((acc, seg) => acc + seg.weight, 0);
        let currentAngle = 0;
        const centerX = 250;
        const centerY = 250;
        const radius = 250;

        segments.forEach(seg => {
            const sliceAngle = (seg.weight / totalWeight) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#1a1a1a";
            ctx.stroke();

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(currentAngle + sliceAngle / 2);
            ctx.textAlign = "right";
            ctx.fillStyle = seg.text.includes("SIGUE") ? "#747d8c" : "white";
            ctx.font = "bold 24px Arial";
            ctx.fillText(seg.text, radius - 20, 10);
            ctx.restore();

            seg.startAngle = currentAngle;
            seg.endAngle = currentAngle + sliceAngle;
            currentAngle += sliceAngle;
        });

        let isSpinning = false;
        
        spinBtn.addEventListener('click', () => {
            if (isSpinning) return;
            isSpinning = true;
            spinBtn.disabled = true;
            spinBtn.innerText = "GIRANDO...";

            let randomWeight = Math.random() * totalWeight;
            let weightSum = 0;
            let selectedIndex = 0;
            
            for(let i = 0; i < segments.length; i++) {
                weightSum += segments[i].weight;
                if (randomWeight <= weightSum) {
                    selectedIndex = i;
                    break;
                }
            }
            
            const segment = segments[selectedIndex];
            const randomInSegment = segment.startAngle + (Math.random() * (segment.endAngle - segment.startAngle));
            const spinRounds = 10;
            const targetRotation = (Math.PI * 2 * spinRounds) + ((Math.PI * 2) - randomInSegment);
            
            let start = null;
            const duration = 5000;

            function animate(timestamp) {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                const percent = Math.min(progress / duration, 1);
                const ease = 1 - Math.pow(1 - percent, 3);
                const currentRot = targetRotation * ease;
                canvas.style.transform = \`rotate(\${(currentRot * 180 / Math.PI) - 90}deg)\`;

                if (progress < duration) {
                    requestAnimationFrame(animate);
                } else {
                    setTimeout(() => {
                        tg.sendData(JSON.stringify({ premio: segment.text }));
                    }, 500);
                }
            }
            requestAnimationFrame(animate);
        });
    </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
    if (req.url === '/ruleta') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HTML_RULETA);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Tatuador Online - V11.0 (Instrucciones Ruleta) ✅');
    }
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
    alarmas: {}, cumples: {}, 
    ultima_ruleta: {}, sanciones: {}, intentos_ruleta: {}, 
    inventario: {}, 
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
        if (!db.sanciones) db.sanciones = {};
        if (!db.intentos_ruleta) db.intentos_ruleta = {};
        if (!db.inventario) db.inventario = {};
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. UTILIDADES
// ==========================================
const notificarAdmin = (ctx, accion) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) {
        const usuario = ctx.from.first_name || "Desconocido";
        const id = ctx.from.id;
        const username = ctx.from.username ? `@${ctx.from.username}` : "Sin alias";
        bot.telegram.sendMessage(MI_ID, `🔔 **ACTIVIDAD DETECTADA**\n\n👤 **Usuario:** ${usuario} (${username})\n🆔 **ID:** \`${id}\`\n🔘 **Acción:** ${accion}`, { parse_mode: 'Markdown' }).catch(err => console.log("Error notificando"));
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

function tiempoRestante(timestampFin) {
    const diff = timestampFin - Date.now();
    if (diff <= 0) return null;
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${dias}d ${horas}h ${minutos}m`;
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
// 4. ESCENAS (Inventario, Citas, Etc.)
// ==========================================

const canjeWizard = new Scenes.WizardScene('canje-wizard',
    (ctx) => {
        ctx.reply('🏦 **GESTIÓN DE INVENTARIO**\n\nPor favor, introduce el **ID del Cliente** para ver su inventario de premios:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const clienteId = ctx.message.text.trim();
        const premios = db.inventario[clienteId];

        if (!premios || premios.length === 0) {
            ctx.reply('❌ Este cliente no tiene premios en su inventario.');
            return ctx.scene.leave();
        }

        ctx.wizard.state.canje = { clienteId: clienteId };
        
        const botones = premios.map((p, index) => {
            return [Markup.button.callback(`🎁 ${p.premio} (${new Date(p.fecha).toLocaleDateString()})`, `sel_${index}`)];
        });
        botones.push([Markup.button.callback('❌ Cancelar', 'cancelar')]);

        await ctx.reply(`🎒 **INVENTARIO DE ${clienteId}**\nSelecciona el premio a aplicar:`, Markup.inlineKeyboard(botones));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) {
            ctx.reply('❌ Por favor, selecciona un botón.');
            return;
        }

        const accion = ctx.callbackQuery.data;
        if (accion === 'cancelar') {
            ctx.reply('Operación cancelada.');
            return ctx.scene.leave();
        }

        if (accion.startsWith('sel_')) {
            const index = parseInt(accion.split('_')[1]);
            const premios = db.inventario[ctx.wizard.state.canje.clienteId];
            
            if (!premios || !premios[index]) {
                ctx.reply('❌ Error al recuperar el premio.');
                return ctx.scene.leave();
            }

            ctx.wizard.state.canje.premioIndex = index;
            ctx.wizard.state.canje.premioData = premios[index];
            
            await ctx.answerCbQuery();
            await ctx.reply(`💰 Has seleccionado: **${premios[index].premio}**\n\nIntroduce el **IMPORTE TOTAL** del tatuaje (en €) para calcular y aplicar el premio:`);
            return ctx.wizard.next();
        }
    },
    (ctx) => {
        const importe = parseFloat(ctx.message.text);
        if (isNaN(importe)) {
            ctx.reply('❌ Por favor, introduce un número válido (ej: 100).');
            return;
        }

        const premioTexto = ctx.wizard.state.canje.premioData.premio;
        let descuento = 0;
        let final = importe;

        if (premioTexto.includes('%')) {
            const porcentaje = parseInt(premioTexto.match(/\d+/)[0]);
            descuento = (importe * porcentaje) / 100;
            final = importe - descuento;
        }

        ctx.wizard.state.canje.importe = importe;
        ctx.wizard.state.canje.final = final;

        ctx.reply(
            `🧾 **RESUMEN DE OPERACIÓN**\n\n` +
            `🔹 Importe Base: ${importe}€\n` +
            `🎁 Premio: ${premioTexto}\n` +
            `📉 Descuento: -${descuento}€\n` +
            `💵 **TOTAL A COBRAR: ${final}€**\n\n` +
            `¿Confirmar y **ELIMINAR** premio del inventario?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ SI, Canjear', 'confirm_yes'), Markup.button.callback('❌ NO, Cancelar', 'confirm_no')]
            ])
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return;
        
        if (ctx.callbackQuery.data === 'confirm_yes') {
            const state = ctx.wizard.state.canje;
            const inventario = db.inventario[state.clienteId];
            inventario.splice(state.premioIndex, 1); 
            guardar();

            await ctx.reply(`✅ **PREMIO COMPLETADO**\nSe ha cobrado ${state.final}€ y el premio se ha eliminado del inventario.`);
            try {
                await ctx.telegram.sendMessage(state.clienteId, `🗑️ **PREMIO CANJEADO**\nTu premio "${state.premioData.premio}" ha sido aplicado y eliminado de tu inventario.`);
            } catch (e) { }

        } else {
            await ctx.reply('❌ Operación cancelada. El premio sigue en el inventario.');
        }
        await ctx.answerCbQuery();
        return ctx.scene.leave();
    }
);

const diccionarioScene = new Scenes.WizardScene('diccionario-scene',
    (ctx) => { ctx.reply('📚 Símbolo:\n(Ej: lobo, león, rosa...)'); return ctx.wizard.next(); },
    (ctx) => { 
        const input = ctx.message.text.toLowerCase().trim();
        const foundKey = Object.keys(diccionarioSimbolos).find(key => 
            key.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
            input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        if (foundKey) ctx.reply(`📖 **${foundKey.toUpperCase()}:**\n${diccionarioSimbolos[foundKey]}`, { parse_mode: 'Markdown' });
        else ctx.reply('❌ No tengo ese símbolo.');
        return ctx.scene.leave(); 
    }
);

const probadorScene = new Scenes.WizardScene('probador-scene',
    (ctx) => { ctx.reply('🕶️ **PROBADOR**\n1️⃣ Envía FOTO CUERPO.'); ctx.wizard.state.probador = {}; return ctx.wizard.next(); },
    (ctx) => { if (!ctx.message.photo) return ctx.reply('❌ Foto requerida'); ctx.wizard.state.probador.bodyFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; ctx.reply('2️⃣ Envía DISEÑO (PNG).'); return ctx.wizard.next(); },
    async (ctx) => {
        let designFileId;
        if (ctx.message.photo) designFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        else if (ctx.message.document) designFileId = ctx.message.document.file_id;
        else return ctx.reply('❌ Imagen requerida');
        ctx.reply('🎨 Procesando...');
        try {
            const bodyUrl = await ctx.telegram.getFileLink(ctx.wizard.state.probador.bodyFileId);
            const designUrl = await ctx.telegram.getFileLink(designFileId);
            const bodyImage = await Jimp.read(bodyUrl.href);
            const designImage = await Jimp.read(designUrl.href);
            designImage.resize(bodyImage.bitmap.width * 0.45, Jimp.AUTO);
            bodyImage.composite(designImage, (bodyImage.bitmap.width/2)-(designImage.bitmap.width/2), (bodyImage.bitmap.height/2)-(designImage.bitmap.height/2));
            const buffer = await bodyImage.getBufferAsync(Jimp.MIME_JPEG);
            await ctx.replyWithPhoto({ source: buffer });
        } catch (e) { ctx.reply('❌ Error.'); }
        return ctx.scene.leave();
    }
);

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
        await ctx.replyWithDocument({ source: Buffer.from(ics), filename: 'cita.ics' });
        return ctx.scene.leave();
    }
);

const simpleWizard = (name, text, cb) => new Scenes.WizardScene(name, (ctx) => { ctx.reply(text); return ctx.wizard.next(); }, cb);
const broadcastScene = simpleWizard('broadcast-wizard', 'Mensaje a todos:', async (ctx) => { ctx.reply('Enviando...'); return ctx.scene.leave(); });
const tattooScene = new Scenes.WizardScene('tattoo-wizard', (ctx)=>{ notificarAdmin(ctx, 'Entró a Presupuesto'); ctx.reply('Nombre:'); return ctx.wizard.next()}, (ctx)=>{ctx.reply('Recibido.'); return ctx.scene.leave()});
const mineScene = new Scenes.BaseScene('mine-scene'); mineScene.enter(ctx => { notificarAdmin(ctx, 'Minando'); ctx.reply('Minando... /start para salir'); });
const panicoScene = new Scenes.WizardScene('panico-scene', (ctx) => { notificarAdmin(ctx, '⚠️ ALERTA: Botón Pánico'); ctx.reply('1. ¿Calor?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('2. ¿Pus?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('3. ¿Fiebre?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Resultado...'); return ctx.scene.leave(); });
const regaloScene = new Scenes.WizardScene('regalo-scene', (ctx) => { ctx.reply('Nombre:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Importe:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Generada.'); return ctx.scene.leave(); });
const cumpleScene = new Scenes.WizardScene('cumple-scene', (ctx) => { ctx.reply('Fecha DD/MM:'); return ctx.wizard.next(); }, (ctx) => { db.cumples[ctx.from.id] = ctx.message.text; guardar(); ctx.reply('Guardado'); return ctx.scene.leave(); });

const stage = new Scenes.Stage([canjeWizard, tattooScene, mineScene, broadcastScene, citaWizard, probadorScene, diccionarioScene, panicoScene, regaloScene, cumpleScene]);
bot.use(session());
bot.use(stage.middleware());

// --- START ---
bot.start((ctx) => {
    notificarAdmin(ctx, '🚀 START');
    const text = ctx.message.text;
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != ctx.from.id && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1;
            guardar();
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

bot.hears('🔥 Cita / Presupuesto', (ctx) => { notificarAdmin(ctx, '🔥 Cita / Presupuesto'); ctx.scene.enter('tattoo-wizard'); });
bot.hears('🎁 Tarjetas Regalo', (ctx) => { notificarAdmin(ctx, '🎁 Tarjetas Regalo'); ctx.scene.enter('regalo-scene'); });
bot.hears('👤 Mi Perfil', (ctx) => {
    notificarAdmin(ctx, '👤 Mi Perfil');
    const u = ctx.from;
    
    // MOSTRAR INVENTARIO
    const misPremios = db.inventario[u.id] || [];
    let msgPremios = misPremios.length > 0 ? "\n🎒 **TUS PREMIOS:**" : "\n🎒 **TUS PREMIOS:** Ninguno.";
    misPremios.forEach(p => msgPremios += `\n- ${p.premio} (${new Date(p.fecha).toLocaleDateString()})`);

    ctx.reply(`👤 **MI PERFIL**\n\n🆔 ID: \`${u.id}\`\n📛 Nombre: ${u.first_name}\n💎 Puntos: ${db.puntos[u.id] || 0}\n📅 Citas: ${db.citas.filter(c => c.clienteId == u.id).length}${msgPremios}`, {parse_mode: 'Markdown'});
});

// ======================================================
// 🔥 CAMBIO PRINCIPAL: MENÚ ZONA FUN + MENSAJE PREVIO
// ======================================================
bot.hears('🎮 Zona Fun', (ctx) => {
    notificarAdmin(ctx, '🎮 Zona Fun');
    ctx.reply('🎢 **ZONA FUN**', Markup.keyboard([
        ['🎰 Tirar Ruleta'], // BOTÓN DE TEXTO NORMAL (Abre mensaje info)
        ['🔮 Oráculo', '🎱 Bola 8'], 
        ['📚 Diccionario', '🕶️ Probador 2.0'],
        ['💬 Otro (Contactar)', '⬅️ Volver']
    ]).resize());
});

// NUEVO HANDLER: MENSAJE PROFESIONAL DE INSTRUCCIONES
bot.hears('🎰 Tirar Ruleta', (ctx) => {
    const infoMsg = 
        `🎰 **RULETA SPICY INK - NORMATIVA DE USO**\n\n` +
        `Bienvenido al sistema de recompensas diarias. Por favor, lee atentamente:\n\n` +
        `📜 **REGLAS**\n` +
        `✅ **Límite:** 1 Tirada permitida cada 24 horas.\n` +
        `⚠️ **Sanciones Automáticas (Anti-Fraude):**\n` +
        `   • 2º Intento: Suspensión de **2 días**.\n` +
        `   • 3º Intento: Suspensión acumulada de **5 días**.\n\n` +
        `🏆 **PREMIOS DISPONIBLES**\n` +
        `💎 **100% DTO** (Tatuaje Gratis)\n` +
        `🥈 **50% DTO**\n` +
        `🥉 **20% DTO**\n\n` +
        `🎒 **CÓMO FUNCIONA**\n` +
        `1. Si ganas, el premio se guarda automáticamente en **'👤 Mi Perfil'**.\n` +
        `2. Cuando vengas al estudio, verificaremos y canjearemos el premio desde tu inventario.\n\n` +
        `👇 **¡BUENA SUERTE!** 👇`;

    ctx.reply(infoMsg, Markup.inlineKeyboard([
        [Markup.button.webApp('🚀 ABRIR RULETA', `${URL_WEB}/ruleta`)]
    ]));
});
// ======================================================

bot.hears('🚑 SOS & Cuidados', (ctx) => {
    notificarAdmin(ctx, '🚑 SOS & Cuidados');
    ctx.reply('🏥 **CUIDADOS**', Markup.keyboard([['🚨 PÁNICO', '⏰ Alarma Crema'], ['🩸 Dolor', '🧼 Guía'], ['💬 Otro (Contactar)', '⬅️ Volver']]).resize());
});

bot.hears('💎 Club VIP', (ctx) => {
    notificarAdmin(ctx, '💎 Club VIP');
    ctx.reply(`💎 **PUNTOS:** ${db.puntos[ctx.from.id] || 0}`, Markup.inlineKeyboard([[Markup.button.callback('📅 Mi Cumple', 'set_cumple')], [Markup.button.callback('💉 Minar', 'ir_minar')]]));
});

bot.hears('💬 Otro (Contactar)', (ctx) => {
    notificarAdmin(ctx, '💬 Contacto');
    ctx.reply(`📩 **CONTACTO**`, Markup.inlineKeyboard([[Markup.button.url('📲 Hablar', `tg://user?id=${MI_ID}`)]]));
});

// --- RULETA ANTI-CHEAT & INVENTARIO ---
bot.on('web_app_data', (ctx) => {
    const uid = ctx.from.id;
    const hoy = new Date().toDateString();
    const ahora = Date.now();
    const alias = ctx.from.username ? `@${ctx.from.username}` : "Sin alias";
    const nombre = ctx.from.first_name || "Desconocido";

    if (db.sanciones[uid] && db.sanciones[uid] > ahora) {
        return ctx.reply(`🚫 **SANCIONADO**\nRestante: **${tiempoRestante(db.sanciones[uid])}**.`);
    }

    if (db.ultima_ruleta[uid] === hoy) {
        let intentos = (db.intentos_ruleta[uid] || 1) + 1;
        db.intentos_ruleta[uid] = intentos;
        
        let duracion = 0;
        if (intentos === 2) duracion = 2 * 86400000;
        else if (intentos >= 3) duracion = 5 * 86400000;

        if (duracion > 0) {
            db.sanciones[uid] = ahora + duracion;
            bot.telegram.sendMessage(MI_ID, `🚫 **SANCIONADO**\n👤 ${nombre}\n🔄 Intento: ${intentos}`);
            guardar();
            return ctx.reply(`🚨 **TRAMPA DETECTADA**\nSanción aplicada: ${intentos >= 3 ? '5 días' : '2 días'}.\nJuega limpio.`);
        } else {
            guardar();
            return ctx.reply('🛑 Ya jugaste hoy. Vuelve mañana.');
        }
    }

    const data = JSON.parse(ctx.webAppData.data);
    const premio = data.premio;
    
    db.ultima_ruleta[uid] = hoy;
    db.intentos_ruleta[uid] = 1;

    bot.telegram.sendMessage(MI_ID, `🎰 **RULETA WIN**\n👤 ${nombre}\n🆔 \`${uid}\`\n🎁 ${premio}`, { parse_mode: 'Markdown' });

    if (premio.includes("SIGUE")) {
        ctx.reply('💨 **SIGUE JUGANDO**\nSuerte mañana.');
    } else {
        if (!db.inventario[uid]) db.inventario[uid] = [];
        db.inventario[uid].push({ id: Date.now(), premio: premio, fecha: Date.now() });

        ctx.reply(`🎉 **GANASTE: ${premio}**\n\nSe ha guardado en tu inventario (Ver en '👤 Mi Perfil').\nEnseña tu perfil al tatuador para canjearlo.`);
    }
    guardar();
});

bot.hears('🩸 Dolor', (ctx) => { ctx.reply('🔥 ZONA:', Markup.inlineKeyboard([[Markup.button.callback('💪 Brazo', 'd_3')], [Markup.button.callback('🦴 Costillas', 'd_9')]])); });
bot.action(/d_(\d+)/, (ctx) => { ctx.answerCbQuery(`Nivel: ${ctx.match[1]}/10`, { show_alert: true }); });

bot.hears('🔮 Oráculo', (ctx) => { ctx.reply(`🔮 ${oraculoFrases[Math.floor(Math.random()*oraculoFrases.length)]}`); });
bot.hears('🎱 Bola 8', (ctx) => { ctx.reply(bola8Respuestas[Math.floor(Math.random()*bola8Respuestas.length)]); });
bot.hears('⏰ Alarma Crema', (ctx) => { 
    const uid = ctx.from.id;
    if (db.alarmas[uid]) { delete db.alarmas[uid]; ctx.reply('🔕 OFF'); }
    else { db.alarmas[uid] = Date.now(); ctx.reply('🔔 ON (Cada 4h)'); }
    guardar();
});
bot.hears('📚 Diccionario', (ctx) => { ctx.scene.enter('diccionario-scene'); });
bot.hears('🚨 PÁNICO', (ctx) => { notificarAdmin(ctx, '🚨 PÁNICO'); ctx.scene.enter('panico-scene'); });
bot.hears('🕶️ Probador 2.0', (ctx) => { ctx.scene.enter('probador-scene'); });
bot.action('set_cumple', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('cumple-scene'); });
bot.action('ir_minar', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('mine-scene'); });
bot.hears('⬅️ Volver', (ctx) => irAlMenuPrincipal(ctx));
bot.hears('🧼 Guía', (ctx) => { ctx.reply('Lavar, Secar, Crema. 3 veces/día.'); });

// PANEL ADMIN
bot.hears('📊 Panel Admin', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    return ctx.reply('🛠️ **PANEL**', Markup.inlineKeyboard([
        [Markup.button.callback('👥 Lista', 'admin_usuarios'), Markup.button.callback('🎁 Canjear Premio', 'admin_canje')], 
        [Markup.button.callback('📅 Nueva Cita', 'admin_cita'), Markup.button.callback('📢 Difusión', 'admin_broadcast')]
    ]));
});

bot.action('admin_usuarios', (ctx) => { ctx.reply(`Usuarios: ${Object.keys(db.puntos).length}`); ctx.answerCbQuery(); });
bot.action('admin_cita', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('cita-wizard'); });
bot.action('admin_broadcast', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('broadcast-wizard'); });
bot.action('admin_canje', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('canje-wizard'); });

setInterval(() => {
    const ahora = Date.now();
    db.citas.forEach(c => {
        if (!c.avisado24h && (c.fecha - ahora) > 0 && (c.fecha - ahora) <= 86400000) {
            bot.telegram.sendMessage(c.clienteId, `⏰ Mañana cita: ${c.fechaTexto}`).catch(()=>{});
            c.avisado24h = true; guardar();
        }
    });
}, 60000);

bot.launch().then(() => console.log('🚀 SpicyInk V11 (Instrucciones Ruleta)'));
