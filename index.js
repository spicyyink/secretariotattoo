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

// HTML DE LA RULETA (Visualización)
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
        let currentAngle = 0; const centerX = 250; const centerY = 250; const radius = 250;
        segments.forEach(seg => {
            const sliceAngle = (seg.weight / totalWeight) * 2 * Math.PI;
            ctx.beginPath(); ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath(); ctx.fillStyle = seg.color; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = "#1a1a1a"; ctx.stroke();
            ctx.save(); ctx.translate(centerX, centerY);
            ctx.rotate(currentAngle + sliceAngle / 2); ctx.textAlign = "right";
            ctx.fillStyle = seg.text.includes("SIGUE") ? "#747d8c" : "white";
            ctx.font = "bold 24px Arial"; ctx.fillText(seg.text, radius - 20, 10); ctx.restore();
            seg.startAngle = currentAngle; seg.endAngle = currentAngle + sliceAngle; currentAngle += sliceAngle;
        });
        let isSpinning = false;
        spinBtn.addEventListener('click', () => {
            if (isSpinning) return;
            isSpinning = true; spinBtn.disabled = true; spinBtn.innerText = "GIRANDO...";
            let randomWeight = Math.random() * totalWeight;
            let weightSum = 0; let selectedIndex = 0;
            for(let i = 0; i < segments.length; i++) {
                weightSum += segments[i].weight;
                if (randomWeight <= weightSum) { selectedIndex = i; break; }
            }
            const segment = segments[selectedIndex];
            const randomInSegment = segment.startAngle + (Math.random() * (segment.endAngle - segment.startAngle));
            const spinRounds = 10;
            const targetRotation = (Math.PI * 2 * spinRounds) + ((Math.PI * 2) - randomInSegment);
            let start = null; const duration = 5000;
            function animate(timestamp) {
                if (!start) start = timestamp;
                const progress = timestamp - start;
                const percent = Math.min(progress / duration, 1);
                const ease = 1 - Math.pow(1 - percent, 3);
                const currentRot = targetRotation * ease;
                canvas.style.transform = \`rotate(\${(currentRot * 180 / Math.PI) - 90}deg)\`;
                if (progress < duration) { requestAnimationFrame(animate); } 
                else { setTimeout(() => { tg.sendData(JSON.stringify({ premio: segment.text })); }, 500); }
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
        res.end('Tatuador Online - V13.0 (Fusión Completa + Fix Presupuesto) ✅');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor HTTP activo en puerto ${PORT}`);
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS UNIFICADA
// ==========================================
let db = { 
    clics: {}, referidos: {}, confirmados: {}, invitados: {}, 
    fichas: {}, puntos: {}, cupones: {}, citas: [], 
    alarmas: {}, cumples: {}, 
    ultima_ruleta: {}, sanciones: {}, intentos_ruleta: {}, 
    inventario: {}, // Premios ganados
    mantenimiento: false 
};

// Persistencia en disco
const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        // Inicialización de seguridad para campos nuevos
        if (!db.citas) db.citas = [];
        if (!db.alarmas) db.alarmas = {};
        if (!db.cumples) db.cumples = {};
        if (!db.ultima_ruleta) db.ultima_ruleta = {};
        if (!db.sanciones) db.sanciones = {};
        if (!db.intentos_ruleta) db.intentos_ruleta = {};
        if (!db.inventario) db.inventario = {}; 
        if (!db.fichas) db.fichas = {}; // Fichas de presupuesto
        if (!db.clics) db.clics = {}; // Minería
        if (db.mantenimiento === undefined) db.mantenimiento = false;
        console.log("✅ DB Cargada y Verificada.");
    } catch (e) { console.log("❌ Error cargando DB, creando nueva."); }
} else {
    guardar();
}

function guardar() {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.log("❌ Error al guardar DB"); }
}

// ==========================================
// 3. UTILIDADES
// ==========================================
const notificarAdmin = (ctx, accion) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) {
        const usuario = ctx.from.first_name || "Desconocido";
        bot.telegram.sendMessage(MI_ID, `🔔 **ACTIVIDAD**\n👤 ${usuario}\n🔘 ${accion}`, { parse_mode: 'Markdown' }).catch(()=>{});
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
    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SpicyInk//TattooBot//EN
BEGIN:VEVENT
UID:${Date.now()}@spicyink
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(fechaInicio)}
DTEND:${formatICSDate(fechaFin)}
SUMMARY:Tatuaje con ${nombreCliente}
DESCRIPTION:${descripcion}\\n📞 Tel: ${telefono}
BEGIN:VALARM
TRIGGER:-PT24H
DESCRIPTION:Recordatorio
ACTION:DISPLAY
END:VALARM
END:VEVENT
END:VCALENDAR`;
}

function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray', 'color': 'full color', 'realismo': 'photorealistic',
        'fine line': 'ultra fine line', 'blackwork': 'heavy blackwork', 'lobo': 'wolf', 'león': 'lion',
        'rosa': 'rose', 'calavera': 'skull', 'mandalas': 'mandala', 'antebrazo': 'forearm', 'brazo': 'arm'
    };
    let traducido = texto.toLowerCase().trim();
    for (const [es, en] of Object.entries(diccionario)) {
        const regex = new RegExp(`\\b${es}\\b`, 'g');
        traducido = traducido.replace(regex, en);
    }
    return traducido;
}

// ==========================================
// 🔥 LÓGICA DE PRESUPUESTO DINÁMICA (CÓDIGO 1 - RESTAURADO)
// ==========================================
function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    const zonaLow = zona.toLowerCase();
    const estiloLow = (estilo || "").toLowerCase();
    let estimado = "";

    if (cms <= 5) estimado = "30€ (Tarifa Mini)";
    else if (cms <= 10) estimado = "65€ - 85€ (Mediano)";
    else if (cms <= 14) estimado = "90€ - 110€ (Grande)";
    else if (cms <= 20) estimado = "120€ - 200€ (Maxi)";
    else return "A valorar por el tatuador (Pieza XL / Sesión)";

    let pluses = [];
    if (estiloLow.includes("realismo")) pluses.push("Complejidad de Estilo (Realismo)");
    else if (estiloLow.includes("lettering")) pluses.push("Detalle de Caligrafía (Lettering)");

    const zonasCriticas = ['costillas', 'cuello', 'mano', 'rodilla', 'esternon', 'cara', 'pies', 'columna', 'codo', 'tobillo', 'axila'];
    if (zonasCriticas.some(z => zonaLow.includes(z))) pluses.push("Dificultad de Zona Anatómica");

    if (tieneFoto) pluses.push("Carga de detalle analizada en referencia 🖼️");
    else pluses.push("Sin referencia visual (Sujeto a cambios)");

    let base = `Estimado base: ${estimado}`;
    if (pluses.length > 0) base += `\n⚠️ FACTORES DE AJUSTE:\n└ ${pluses.join("\n└ ")}`;
    
    base += `\n\n📢 **AVISO:** Este presupuesto ha sido generado automáticamente por un robot con fines puramente orientativos. El precio real y definitivo será estipulado únicamente por el tatuador tras revisar personalmente el diseño final.`;
    
    return base;
}

// ==========================================
// 4. ESCENAS (WIZARDS)
// ==========================================

// --- CITA (ADMIN) ---
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
        } catch (e) { ctx.reply('❌ Fecha mal (DD/MM/YYYY HH:MM).'); return; }
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

// --- PRESUPUESTO COMPLETO (CÓDIGO 1 RESTAURADO - IDÉNTICO A IMAGEN) ---
const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('⚠️ FORMULARIO DE CITA\n━━━━━━━━━━━━━━━━━━━━\nEscribe tu Nombre Completo:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('🔞 ¿Edad?', Markup.keyboard([['+18 años', '+16 años'], ['Menor de 16']]).oneTime().resize()); return ctx.wizard.next(); },
    (ctx) => {
        if (ctx.message.text === 'Menor de 16') { ctx.reply('❌ Mínimo 16 años.'); return ctx.scene.leave(); }
        ctx.wizard.state.f.edad = ctx.message.text;
        ctx.reply('📍 Selecciona la zona del cuerpo:', 
            Markup.keyboard([
                ['Antebrazo', 'Bíceps', 'Hombro'],
                ['Costillas', 'Esternón', 'Espalda'],
                ['Muslo', 'Gemelo', 'Tobillo'],
                ['Mano', 'Cuello', 'Muñeca'],
                ['Otro']
            ]).oneTime().resize()); 
        return ctx.wizard.next();
    },
    (ctx) => { 
        ctx.wizard.state.f.zona = ctx.message.text; 
        ctx.reply('📏 Tamaño aproximado en cm:', Markup.removeKeyboard()); 
        return ctx.wizard.next(); 
    },
    (ctx) => { 
        ctx.wizard.state.f.tamano = ctx.message.text; 
        ctx.reply('🎨 Selecciona el Estilo técnico:', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Fine Line', 'estilo_Fine Line'), Markup.button.callback('Realismo', 'estilo_Realismo')],
                [Markup.button.callback('Lettering', 'estilo_Lettering'), Markup.button.callback('Blackwork', 'estilo_Blackwork')],
                [Markup.button.callback('Otro', 'estilo_Otro')]
            ]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery) {
            ctx.wizard.state.f.estilo = ctx.callbackQuery.data.replace('estilo_', '');
            ctx.answerCbQuery();
            ctx.reply('🏥 Alergias o medicación:');
            return ctx.wizard.next();
        }
        return ctx.reply('⚠️ Usa los botones.');
    },
    (ctx) => { 
        ctx.wizard.state.f.salud = ctx.message.text; 
        ctx.reply('🖼️ REFERENCIA VISUAL (Recomendado)\n━━━━━━━━━━━━━━━━━━━━\nEnvía una foto de tu diseño o pulsa el botón:', 
            Markup.inlineKeyboard([[Markup.button.callback('❌ No tengo diseño', 'no_foto')]]));
        return ctx.wizard.next(); 
    },
    async (ctx) => {
        if (ctx.message && ctx.message.photo) {
            ctx.wizard.state.f.foto = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            ctx.wizard.state.f.tieneFoto = true;
        } else if (ctx.callbackQuery && ctx.callbackQuery.data === 'no_foto') {
            ctx.wizard.state.f.tieneFoto = false;
            ctx.answerCbQuery();
        } else return ctx.reply('⚠️ Envía una foto o pulsa el botón.');
        ctx.reply('📲 WhatsApp (con prefijo, ej: 34600000000):'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text.replace(/\s+/g, '').replace('+', '');
        db.fichas[ctx.from.id] = d;
        guardar();
        const estimacion = calcularPresupuesto(d.tamano, d.zona, d.estilo, d.tieneFoto);
        
        const fichaAdmin = `🔔 **NUEVA SOLICITUD**\n━━━━━━━━━━━━━━━━━━━━\n👤 **ID Usuario:** \`${ctx.from.id}\`\n👤 **Nombre:** ${d.nombre}\n🔞 **Edad:** ${d.edad}\n📍 **Zona:** ${d.zona}\n📏 **Tamaño:** ${d.tamano}\n🎨 **Estilo:** ${d.estilo}\n🏥 **Salud:** ${d.salud}\n📞 **WhatsApp:** +${d.telefono}\n\n💰 **${estimacion.split('\n')[0]}**`;
        
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.url('📲 Hablar por WhatsApp', `https://wa.me/${d.telefono}`)]])
        });
        if (d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto, { caption: `🖼️ Referencia de ${d.nombre}` });

        await ctx.reply(`✅ SOLICITUD ENVIADA\n━━━━━━━━━━━━━━━━━━━━\n${estimacion}`);
        return ctx.scene.leave();
    }
);
// ------------------------------------------------------------------------------------------------

// --- IA GENERADORA (GEMINI PROMPTS) ---
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => { ctx.wizard.state.ai = {}; ctx.reply('🤖 **IA ARTIST**\n¿Qué quieres tatuarte? (Ej: Un león con corona)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.elemento = ctx.message.text; ctx.reply('🎨 ¿Estilo? (Ej: Geométrico, Acuarela)'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.estilo = ctx.message.text; ctx.reply('📍 ¿En qué zona del cuerpo?'); return ctx.wizard.next(); },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        const zona = ctx.message.text;
        const prompt = `Tattoo design of ${traducirTerminos(ai.elemento)} in ${traducirTerminos(ai.estilo)} style, optimized for ${traducirTerminos(zona)}. High contrast, white background, 8k resolution.`;
        const url = `https://gemini.google.com/app?q=${encodeURIComponent("Genera imagen: " + prompt)}`;
        
        await ctx.reply(`🧠 **IDEA GENERADA**\n\nPrompt: \`${prompt}\``, Markup.inlineKeyboard([
            [Markup.button.url('🎨 VER EN GEMINI', url)],
            [Markup.button.callback('⬅️ Menú', 'salir_ia')]
        ]));
        return ctx.scene.leave();
    }
);

// --- MINERÍA (JUEGO) ---
const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 **MINERÍA DE TINTA**\nLlenado: ${db.clics[uid] || 0}/1000 ml\n🎁 1000ml = Tatuaje 20€ Gratis`, Markup.inlineKeyboard([
        [Markup.button.callback('💉 INYECTAR', 'minar')], [Markup.button.callback('⬅️ Salir', 'salir')]
    ]));
});
mineScene.action('minar', (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) { ctx.reply('🎉 **¡TANQUE LLENO!** Ganaste un tattoo 20€. Haz captura.'); db.clics[uid] = 0; guardar(); return ctx.scene.leave(); }
    ctx.answerCbQuery(`Nivel: ${db.clics[uid]}`);
});
mineScene.action('salir', (ctx) => { ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

// --- CANJE DE PREMIO RULETA (ADMIN) ---
const canjeWizard = new Scenes.WizardScene('canje-wizard',
    (ctx) => { ctx.reply('🏦 **INVENTARIO CLIENTE**\nID Cliente:'); return ctx.wizard.next(); },
    async (ctx) => {
        const cid = String(ctx.message.text.trim());
        const premios = db.inventario[cid];
        if (!premios || premios.length === 0) { ctx.reply('❌ Sin premios.'); return ctx.scene.leave(); }
        ctx.wizard.state.canje = { cid };
        const btns = premios.map((p, i) => [Markup.button.callback(`🎁 ${p.premio}`, `sel_${i}`)]);
        await ctx.reply(`🎒 **PREMIOS DE ${cid}**`, Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery || !ctx.callbackQuery.data.startsWith('sel_')) return;
        const idx = parseInt(ctx.callbackQuery.data.split('_')[1]);
        const p = db.inventario[ctx.wizard.state.canje.cid][idx];
        
        // BORRAR PREMIO
        db.inventario[ctx.wizard.state.canje.cid].splice(idx, 1);
        guardar();
        
        await ctx.reply(`✅ **CANJEADO:** ${p.premio}\nEl premio ha sido borrado del inventario.`);
        return ctx.scene.leave();
    }
);

// OTROS WIZARDS SIMPLES
const diccionarioScene = new Scenes.WizardScene('diccionario-scene', (ctx) => { ctx.reply('📚 Símbolo (ej: león):'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Significado: ...'); return ctx.scene.leave(); });
const probadorScene = new Scenes.WizardScene('probador-scene', (ctx) => { ctx.reply('📸 Envía foto cuerpo:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Ahora diseño...'); return ctx.scene.leave(); });
const panicoScene = new Scenes.WizardScene('panico-scene', (ctx) => { notificarAdmin(ctx, '🚨 PÁNICO'); ctx.reply('1. ¿Calor?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('2. ¿Pus?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('3. ¿Fiebre?'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Resultado...'); return ctx.scene.leave(); });
const regaloScene = new Scenes.WizardScene('regalo-scene', (ctx) => { ctx.reply('Nombre:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Importe:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Generada.'); return ctx.scene.leave(); });
const cumpleScene = new Scenes.WizardScene('cumple-scene', (ctx) => { ctx.reply('Fecha DD/MM:'); return ctx.wizard.next(); }, (ctx) => { db.cumples[ctx.from.id] = ctx.message.text; guardar(); ctx.reply('Guardado'); return ctx.scene.leave(); });
const broadcastScene = new Scenes.WizardScene('broadcast-wizard', (ctx) => { ctx.reply('📢 Mensaje a todos:'); return ctx.wizard.next(); }, async (ctx) => { ctx.reply('Enviando...'); return ctx.scene.leave(); });
const couponScene = new Scenes.WizardScene('coupon-wizard', (ctx) => { ctx.reply('Código:'); return ctx.wizard.next(); }, (ctx) => { db.cupones[ctx.message.text] = 10; guardar(); ctx.reply('Creado.'); return ctx.scene.leave(); });

const stage = new Scenes.Stage([tattooScene, mineScene, iaScene, canjeWizard, citaWizard, probadorScene, diccionarioScene, panicoScene, regaloScene, cumpleScene, broadcastScene, couponScene]);
bot.use(session());
bot.use(stage.middleware());

// ==========================================
// 5. MENÚS Y NAVEGACIÓN
// ==========================================
bot.start((ctx) => {
    notificarAdmin(ctx, '🚀 START');
    const uid = String(ctx.from.id);
    const text = ctx.message.text;
    
    // SISTEMA REFERIDOS
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != uid && !db.invitados[uid]) {
            db.invitados[uid] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1;
            guardar();
            bot.telegram.sendMessage(inviterId, `👥 ¡Nuevo referido!`).catch(()=>{});
        }
    }
    return irAlMenuPrincipal(ctx);
});

function irAlMenuPrincipal(ctx) {
    if (db.mantenimiento && ctx.from.id.toString() !== MI_ID.toString()) return ctx.reply('🛠️ Mantenimiento. Volvemos pronto.');
    
    const botones = [
        ['🔥 Cita / Presupuesto', '🎮 Zona Fun'],
        ['🚑 SOS & Cuidados', '💎 Club VIP'],
        ['🎁 Tarjetas Regalo', '👤 Mi Perfil']
    ];
    if (ctx.from.id.toString() === MI_ID.toString()) botones.push(['📊 Panel Admin']);
    
    return ctx.reply(`✨ SPICY INK ✨\nTu estudio digital.`, Markup.keyboard(botones).resize());
}

// HANDLERS MENÚ
bot.hears('🔥 Cita / Presupuesto', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🎁 Tarjetas Regalo', (ctx) => ctx.scene.enter('regalo-scene'));

bot.hears('👤 Mi Perfil', (ctx) => {
    const uid = String(ctx.from.id);
    const misPremios = db.inventario[uid] || [];
    let msg = `👤 **PERFIL**\n🆔 \`${uid}\`\n💎 Puntos: ${db.puntos[uid] || 0}\n\n🎒 **INVENTARIO:**`;
    if (misPremios.length === 0) msg += "\n(Vacío)";
    else misPremios.forEach(p => msg += `\n🎁 ${p.premio} (${new Date(p.fecha).toLocaleDateString()})`);
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ZONA FUN (Fusión: Ruleta + IA + Probador)
bot.hears('🎮 Zona Fun', (ctx) => {
    ctx.reply('🎢 **ZONA FUN**', Markup.keyboard([
        ['🎰 Tirar Ruleta', '🤖 IA: ¿Qué me tatuo?'],
        ['🔮 Oráculo', '🎱 Bola 8'], 
        ['📚 Diccionario', '🕶️ Probador 2.0'],
        ['⬅️ Volver']
    ]).resize());
});

// CLUB VIP (Fusión: Minar + Referidos + Puntos)
bot.hears('💎 Club VIP', (ctx) => {
    const uid = ctx.from.id;
    const refs = db.referidos[uid] || 0;
    ctx.reply(`💎 **CLUB VIP**\n\n👥 Referidos: ${refs}\n💎 Puntos: ${db.puntos[uid] || 0}`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('💉 Minar Tinta (Juego)', 'ir_minar')],
            [Markup.button.callback('👥 Mis Referidos', 'ver_referidos')],
            [Markup.button.callback('📅 Mi Cumple', 'set_cumple')]
        ]));
});

bot.action('ir_minar', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('mine-scene'); });
bot.action('ver_referidos', (ctx) => { 
    const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
    ctx.reply(`👥 **REFERIDOS**\nInvita amigos y gana premios.\n\n🔗 Tu enlace:\n${link}`); 
    ctx.answerCbQuery();
});
bot.action('salir_ia', (ctx) => { ctx.answerCbQuery(); return irAlMenuPrincipal(ctx); });

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => ctx.scene.enter('ia-wizard'));
bot.hears('🎰 Tirar Ruleta', (ctx) => {
    const msg = `🎰 **RULETA DIARIA**\n1 Tirada cada 24h.\n\n👇 ¡JUEGA AHORA! 👇`;
    ctx.reply(msg, Markup.inlineKeyboard([[Markup.button.webApp('🚀 ABRIR', `${URL_WEB}/ruleta`)]]));
});
bot.hears('🚑 SOS & Cuidados', (ctx) => ctx.reply('🏥', Markup.keyboard([['🚨 PÁNICO', '⏰ Alarma Crema'], ['🩸 Dolor', '🧼 Guía'], ['⬅️ Volver']]).resize()));
bot.hears('⬅️ Volver', (ctx) => irAlMenuPrincipal(ctx));
bot.hears('🧼 Guía', (ctx) => ctx.reply('Lavar, Secar, Crema. 3 veces/día.'));
bot.hears('🩸 Dolor', (ctx) => ctx.reply('Selecciona zona:', Markup.inlineKeyboard([[Markup.button.callback('Brazo', 'd_3')]])));
bot.action('d_3', (ctx) => ctx.answerCbQuery('Nivel: 3/10', {show_alert:true}));

// ==========================================
// 6. LÓGICA RULETA (WEBAPP)
// ==========================================
bot.on('web_app_data', (ctx) => {
    const uid = String(ctx.from.id);
    const hoy = new Date().toDateString();
    
    // 1. SANCIONES
    if (db.sanciones[uid] && db.sanciones[uid] > Date.now()) return ctx.reply('🚫 Sancionado.');

    // 2. JUGÓ HOY?
    if (db.ultima_ruleta[uid] === hoy) {
        let intentos = (db.intentos_ruleta[uid] || 1) + 1;
        db.intentos_ruleta[uid] = intentos;
        if (intentos >= 2) {
            db.sanciones[uid] = Date.now() + (intentos>=3 ? 432000000 : 172800000); // 5 dias o 2 dias
            guardar();
            return ctx.reply(`🚨 **TRAMPA**\nHas sido sancionado.`);
        }
        guardar();
        return ctx.reply('🛑 Ya jugaste hoy.');
    }

    // 3. OK
    const data = JSON.parse(ctx.webAppData.data);
    db.ultima_ruleta[uid] = hoy;
    db.intentos_ruleta[uid] = 1;

    if (!data.premio.includes("SIGUE")) {
        if (!db.inventario[uid]) db.inventario[uid] = [];
        db.inventario[uid].push({ id: Date.now(), premio: data.premio, fecha: Date.now() });
        ctx.reply(`🎉 **GANASTE: ${data.premio}**\nGuardado en inventario.`);
    } else {
        ctx.reply('💨 Sigue jugando mañana.');
    }
    guardar();
});

// ==========================================
// 7. PANEL ADMIN COMPLETO
// ==========================================
bot.hears('📊 Panel Admin', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    const estadoMant = db.mantenimiento ? '🔴 ON' : '🟢 OFF';
    ctx.reply(`🛠️ **ADMIN** | Mant: ${estadoMant}`, Markup.inlineKeyboard([
        [Markup.button.callback('👥 Usuarios', 'adm_users'), Markup.button.callback('📅 Nueva Cita', 'admin_cita')],
        [Markup.button.callback('🎁 Canjear Ruleta', 'admin_canje'), Markup.button.callback('🗓️ Calendario', 'adm_cal')],
        [Markup.button.callback('📢 Difusión', 'adm_broad'), Markup.button.callback('🛠️ Mantenimiento', 'adm_mant')],
        [Markup.button.callback('📜 Legal', 'adm_legal'), Markup.button.callback('🎟️ Cupón', 'adm_cup')]
    ]));
});

// Acciones Admin
bot.action('adm_users', (ctx) => { ctx.reply(`Usuarios: ${Object.keys(db.fichas).length + Object.keys(db.inventario).length}`); ctx.answerCbQuery(); });
bot.action('adm_mant', (ctx) => { db.mantenimiento = !db.mantenimiento; guardar(); ctx.reply(`Mantenimiento: ${db.mantenimiento}`); ctx.answerCbQuery(); });
bot.action('adm_legal', (ctx) => { ctx.reply('Texto legal para enviar: "Yo confirmo que soy mayor de edad..."'); ctx.answerCbQuery(); });
bot.action('adm_cal', (ctx) => { 
    const citas = db.citas.filter(c => c.fecha > Date.now()).map(c => `${c.fechaTexto} - ${c.nombre}`).join('\n');
    ctx.reply(citas || "Sin citas futuras."); ctx.answerCbQuery(); 
});
bot.action('admin_cita', (ctx) => ctx.scene.enter('cita-wizard'));
bot.action('admin_canje', (ctx) => ctx.scene.enter('canje-wizard'));
bot.action('adm_broad', (ctx) => ctx.scene.enter('broadcast-wizard'));
bot.action('adm_cup', (ctx) => ctx.scene.enter('coupon-wizard'));

// CRON RECORDATORIOS
setInterval(() => {
    const ahora = Date.now();
    db.citas.forEach(c => {
        if (!c.avisado24h && (c.fecha - ahora) > 0 && (c.fecha - ahora) <= 86400000) {
            bot.telegram.sendMessage(c.clienteId, `⏰ Mañana cita: ${c.fechaTexto}`).catch(()=>{});
            c.avisado24h = true; guardar();
        }
    });
}, 60000);

bot.launch().then(() => console.log('🚀 SpicyInk V13 (Fusión Total)'));
