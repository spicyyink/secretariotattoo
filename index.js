require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR Y WEB APP
// ==========================================
const URL_WEB = process.env.RENDER_EXTERNAL_URL || 'https://TU-PROYECTO.onrender.com'; 

// HTML DE LA RULETA (Sintaxis segura para evitar errores de arranque)
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
                
                // Calculo de grados seguro
                const degrees = (currentRot * 180 / Math.PI) - 90;
                canvas.style.transform = "rotate(" + degrees + "deg)";

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
        res.end('Tatuador Online - V24.0 (Pago Verificado Admin) ✅');
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
    inventario: {}, tarjetas_regalo: {}, tarjetas_pendientes: {},
    mantenimiento: false 
};

const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        // Inicializadores de seguridad
        if (!db.citas) db.citas = [];
        if (!db.alarmas) db.alarmas = {};
        if (!db.cumples) db.cumples = {};
        if (!db.ultima_ruleta) db.ultima_ruleta = {};
        if (!db.sanciones) db.sanciones = {};
        if (!db.intentos_ruleta) db.intentos_ruleta = {};
        if (!db.inventario) db.inventario = {}; 
        if (!db.fichas) db.fichas = {}; 
        if (!db.clics) db.clics = {}; 
        if (db.mantenimiento === undefined) db.mantenimiento = false;
        if (!db.cupones) db.cupones = {};
        if (!db.tarjetas_regalo) db.tarjetas_regalo = {};
        if (!db.tarjetas_pendientes) db.tarjetas_pendientes = {};
    } catch (e) { console.log("❌ Error cargando DB."); }
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
        'rosa': 'rose', 'calavera': 'skull', 'mandalas': 'mandala', 'antebrazo': 'forearm', 'brazo': 'arm', 'tobillo': 'ankle'
    };
    let traducido = texto.toLowerCase().trim();
    for (const [es, en] of Object.entries(diccionario)) {
        const regex = new RegExp(`\\b${es}\\b`, 'g');
        traducido = traducido.replace(regex, en);
    }
    return traducido;
}

function calcularPresupuesto(tamanoStr, zona, estilo, tieneFoto) {
    const cms = parseInt(tamanoStr.replace(/\D/g, '')) || 0;
    let estimado = "";
    if (cms <= 5) estimado = "30€ (Tarifa Mini)";
    else if (cms <= 10) estimado = "65€ - 85€ (Mediano)";
    else if (cms <= 14) estimado = "90€ - 110€ (Grande)";
    else if (cms <= 20) estimado = "120€ - 200€ (Maxi)";
    else return "A valorar por el tatuador (Pieza XL / Sesión)";
    
    let base = `Estimado base: ${estimado}`;
    if (tieneFoto) base += `\n⚠️ FACTORES DE AJUSTE:\n└ Carga de detalle analizada`;
    base += `\n\n📢 **AVISO:** Este presupuesto es orientativo. El precio final lo dará el tatuador.`;
    return base;
}

function generarCodigoRegalo() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'GIFT-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==========================================
// 4. ESCENAS (WIZARDS)
// ==========================================

// --- NUEVA ESCENA DE GESTIÓN DE TARJETAS (ADMIN) ---
const adminGiftScene = new Scenes.WizardScene('admin-gift-wizard',
    (ctx) => {
        ctx.reply('🔍 **BUSCADOR DE TARJETAS**\nIntroduce el CÓDIGO de la tarjeta (ej: GIFT-XXXX-XXXX):', Markup.inlineKeyboard([
            [Markup.button.callback('❌ Cancelar', 'cancelar')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancelar') {
            await ctx.answerCbQuery();
            ctx.reply('Operación cancelada.');
            return ctx.scene.leave();
        }

        const code = ctx.message ? ctx.message.text.trim().toUpperCase() : null;
        if(!code) return ctx.reply('Introduce texto válido.');

        const card = db.tarjetas_regalo[code];

        if (!card) {
            ctx.reply('❌ **ERROR:** Código no encontrado en la base de datos.');
            return ctx.scene.leave();
        }

        ctx.wizard.state.code = code;
        const status = card.canjeado ? '🔴 YA CANJEADO' : '🟢 ACTIVO (Válido)';
        const fechaCompra = new Date(card.fecha).toLocaleDateString('es-ES');
        
        const msg = `🎁 **DETALLES DE TARJETA**\n━━━━━━━━━━━━━━━━━━━━\n🆔 **Código:** \`${code}\`\n💰 **Valor:** ${card.amount}€\n👤 **Para:** ${card.para}\n📞 **Comprador:** ${card.phone}\n📅 **Fecha:** ${fechaCompra}\n📝 **Nota:** "${card.msg}"\n━━━━━━━━━━━━━━━━━━━━\n📊 **ESTADO:** ${status}`;

        if (card.canjeado) {
            await ctx.reply(msg, { parse_mode: 'Markdown' });
            return ctx.scene.leave();
        }

        await ctx.reply(msg, { parse_mode: 'Markdown' });
        await ctx.reply('¿Deseas marcar esta tarjeta como **CANJEADA**?', Markup.inlineKeyboard([
            [Markup.button.callback('✅ SÍ, CANJEAR AHORA', 'do_redeem')],
            [Markup.button.callback('❌ NO, SOLO CONSULTAR', 'cancel_redeem')]
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.callbackQuery) return; 
        const action = ctx.callbackQuery.data;

        if (action === 'do_redeem') {
            const code = ctx.wizard.state.code;
            db.tarjetas_regalo[code].canjeado = true;
            db.tarjetas_regalo[code].fechaCanje = Date.now();
            guardar();
            await ctx.editMessageText(`✅ **TARJETA CANJEADA CON ÉXITO**\nEl código ${code} ha quedado anulado.`);
        } else {
            await ctx.editMessageText('👋 Consulta finalizada. La tarjeta sigue activa.');
        }
        return ctx.scene.leave();
    }
);
// ---------------------------------------------------

const panicoScene = new Scenes.WizardScene('panico-scene',
    (ctx) => {
        ctx.wizard.state.sintomas = 0;
        ctx.reply('🚨 **EVALUADOR DE RIESGOS**\n1️⃣ **¿La zona desprende calor excesivo?**', Markup.inlineKeyboard([[Markup.button.callback('🔥 Sí', 'si'), Markup.button.callback('✅ No', 'no')]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'si') ctx.wizard.state.sintomas++;
        if(ctx.callbackQuery) ctx.answerCbQuery();
        ctx.reply('2️⃣ **¿Observas pus o mal olor?**', Markup.inlineKeyboard([[Markup.button.callback('⚠️ Sí', 'si'), Markup.button.callback('✅ No', 'no')]]));
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'si') ctx.wizard.state.sintomas++;
        if(ctx.callbackQuery) ctx.answerCbQuery();
        ctx.reply('3️⃣ **¿Tienes fiebre?**', Markup.inlineKeyboard([[Markup.button.callback('🤒 Sí', 'si'), Markup.button.callback('✅ No', 'no')]]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'si') ctx.wizard.state.sintomas++;
        if(ctx.callbackQuery) ctx.answerCbQuery();
        const score = ctx.wizard.state.sintomas;
        let diagnosis = score >= 1 ? `⚠️ **ALERTA: POSIBLE INFECCIÓN**\nAcude al médico.` : `✅ **TODO NORMAL**\nSigue cuidándolo.`;
        if (score >= 1) notificarAdmin(ctx, `🚨 ALERTA MÉDICA: ${score} síntomas`);
        await ctx.reply(diagnosis, { parse_mode: 'Markdown' });
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
        } catch (e) { ctx.reply('❌ Fecha mal (DD/MM/YYYY HH:MM).'); return; }
    },
    async (ctx) => {
        const st = ctx.wizard.state.cita;
        const nc = { id: Date.now(), clienteId: st.clienteId, nombre: st.nombre, telefono: st.telefono, fecha: st.timestamp, fechaTexto: st.fechaStr, descripcion: ctx.message.text, avisado24h: false };
        db.citas.push(nc); guardar();
        try { await ctx.telegram.sendMessage(st.clienteId, `📅 **CITA CONFIRMADA**\n${st.nombre}, te esperamos el ${st.fechaStr}`); } catch(e){}
        const ics = generarICS(new Date(st.timestamp), st.nombre, ctx.message.text, st.telefono);
        await ctx.replyWithDocument({ source: Buffer.from(ics), filename: 'cita.ics' }, { caption: `✅ Cita creada para ${st.nombre}` });
        return ctx.scene.leave();
    }
);

const couponScene = new Scenes.WizardScene('coupon-wizard',
    (ctx) => { ctx.reply('🎟️ Código:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.code = ctx.message.text; ctx.reply('💰 Puntos:'); return ctx.wizard.next(); },
    (ctx) => { db.cupones[ctx.wizard.state.code] = parseInt(ctx.message.text); guardar(); ctx.reply('✅ Creado.'); return ctx.scene.leave(); }
);

const broadcastScene = new Scenes.WizardScene('broadcast-wizard',
    (ctx) => { ctx.reply('📢 Mensaje a todos:'); return ctx.wizard.next(); },
    async (ctx) => {
        const users = [...new Set([...Object.keys(db.fichas), ...Object.keys(db.puntos)])];
        ctx.reply(`Enviando a ${users.length}...`);
        for (const uid of users) { try { await ctx.telegram.sendMessage(uid, `📢 **AVISO**\n\n${ctx.message.text}`); } catch(e){} }
        ctx.reply('✅ Hecho.'); return ctx.scene.leave();
    }
);

const reminderScene = new Scenes.WizardScene('reminder-wizard',
    (ctx) => { ctx.reply('⏰ ID Usuario:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.uid = ctx.message.text; ctx.reply('Mensaje:'); return ctx.wizard.next(); },
    async (ctx) => {
        try { await ctx.telegram.sendMessage(ctx.wizard.state.uid, `⏰ **RECORDATORIO**\n${ctx.message.text}`); ctx.reply('✅ Enviado.'); } catch (e) { ctx.reply('❌ Error.'); }
        return ctx.scene.leave();
    }
);

const tattooScene = new Scenes.WizardScene('tattoo-wizard',
    (ctx) => { ctx.reply('📝 Nombre:'); ctx.wizard.state.f = {}; return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.nombre = ctx.message.text; ctx.reply('📍 Zona:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.zona = ctx.message.text; ctx.reply('📏 Tamaño:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('🎨 Estilo:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.f.estilo = ctx.message.text; ctx.reply('📸 Foto (o "No"):'); return ctx.wizard.next(); },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        if (ctx.message.photo) { d.foto = ctx.message.photo[ctx.message.photo.length-1].file_id; d.tieneFoto = true; } else d.tieneFoto = false;
        d.telefono = "No facilitado"; 
        ctx.reply('📞 WhatsApp:'); return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.f;
        d.telefono = ctx.message.text;
        db.fichas[ctx.from.id] = d; guardar();
        const est = calcularPresupuesto(d.tamano, d.zona, d.estilo, d.tieneFoto);
        await ctx.telegram.sendMessage(MI_ID, `🔔 **SOLICITUD**\n👤 ${d.nombre}\n📞 ${d.telefono}\n💰 ${est}`);
        if(d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto);
        ctx.reply(`✅ **RECIBIDO**\n${est}`);
        return ctx.scene.leave();
    }
);

const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => { ctx.wizard.state.ai = {}; ctx.reply('🤖 ¿Qué quieres tatuarte?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.elemento = ctx.message.text; ctx.reply('🎨 Estilo:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.ai.estilo = ctx.message.text; ctx.reply('📍 Zona:'); return ctx.wizard.next(); },
    async (ctx) => {
        const p = ctx.wizard.state.ai;
        const prompt = `Tattoo design of ${p.elemento} in ${p.estilo} style for ${ctx.message.text}. High contrast, white background.`;
        const url = `https://gemini.google.com/app?q=${encodeURIComponent("Genera imagen: " + prompt)}`;
        await ctx.reply(`🧠 **PROMPT:**\n\`${prompt}\``, Markup.inlineKeyboard([[Markup.button.url('🎨 VER EN GEMINI', url)]]));
        return ctx.scene.leave();
    }
);

const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 **MINERÍA**\n${db.clics[uid] || 0}/1000 ml`, Markup.inlineKeyboard([[Markup.button.callback('💉', 'minar'), Markup.button.callback('⬅️', 'salir')]]));
});
mineScene.action('minar', (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if(db.clics[uid] >= 1000) { ctx.reply('🎉 GANASTE!'); db.clics[uid]=0; guardar(); return ctx.scene.leave(); }
    ctx.editMessageText(`💉 **MINERÍA**\n${db.clics[uid]}/1000 ml`, Markup.inlineKeyboard([[Markup.button.callback('💉', 'minar'), Markup.button.callback('⬅️', 'salir')]])).catch(()=>{});
    ctx.answerCbQuery();
});
mineScene.action('salir', (ctx) => { ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

const canjeWizard = new Scenes.WizardScene('canje-wizard',
    (ctx) => { ctx.reply('🏦 ID Cliente:'); return ctx.wizard.next(); },
    async (ctx) => {
        const cid = ctx.message.text.trim();
        const p = db.inventario[cid];
        if(!p || p.length===0) { ctx.reply('❌ Nada.'); return ctx.scene.leave(); }
        ctx.wizard.state.cid = cid;
        const btns = p.map((i, idx) => [Markup.button.callback(i.premio, `del_${idx}`)]);
        ctx.reply('Elige:', Markup.inlineKeyboard(btns));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.callbackQuery && ctx.callbackQuery.data.startsWith('del_')) {
            const idx = parseInt(ctx.callbackQuery.data.split('_')[1]);
            db.inventario[ctx.wizard.state.cid].splice(idx, 1);
            guardar();
            ctx.reply('✅ Canjeado.');
        }
        return ctx.scene.leave();
    }
);

// 🔥 ESCENA TARJETA REGALO (CON APROBACIÓN + DATOS)
const regaloScene = new Scenes.WizardScene('regalo-scene',
    (ctx) => { ctx.wizard.state = { cid: ctx.from.id }; ctx.reply('🎁 ¿Para quién es?'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.para = ctx.message.text; ctx.reply('💰 Importe (ej: 50):'); return ctx.wizard.next(); },
    (ctx) => { 
        const imp = parseInt(ctx.message.text);
        if(isNaN(imp)) return ctx.reply('❌ Número válido:');
        ctx.wizard.state.amount = imp;
        ctx.reply('✉️ Puedes Poner Dedicatoria:'); return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.msg = ctx.message.text;
        ctx.reply('📞 **TU TELÉFONO** (Para confirmar pago):');
        return ctx.wizard.next();
    },
    (ctx) => {
        const c = ctx.wizard.state;
        c.phone = ctx.message.text;
        
        // Mensaje al Admin
        const pid = `PAY-${Date.now()}`;
        if (!db.tarjetas_pendientes) db.tarjetas_pendientes = {};
        db.tarjetas_pendientes[pid] = c;
        guardar();

        const adminMsg = `💸 **SOLICITUD PAGO**\n👤 Compra: ${ctx.from.first_name} (@${ctx.from.username})\n📞 Tel: ${c.phone}\n🎁 Para: ${c.para}\n💰 **${c.amount}€**`;
        
        bot.telegram.sendMessage(MI_ID, adminMsg, Markup.inlineKeyboard([
            [Markup.button.callback('✅ Aceptar', `ok_${pid}`), Markup.button.callback('❌ Rechazar', `no_${pid}`)]
        ]));

        ctx.reply('⌛ **SOLICITUD ENVIADA**\nEn breves se pondrá en contacto el tatuador, una vez recibido el pago, recibes un codigo a canjear.');
        return ctx.scene.leave();
    }
);

// Handlers Pago
bot.action(/^ok_(.+)$/, async (ctx) => {
    const pid = ctx.match[1];
    const d = db.tarjetas_pendientes[pid];
    if(!d) return ctx.answerCbQuery('❌ Ya no existe.');
    
    const code = generarCodigoRegalo();
    db.tarjetas_regalo[code] = { ...d, fecha: Date.now(), canjeado: false, comprador: d.cid };
    delete db.tarjetas_pendientes[pid];
    guardar();

    // FORMATO IDÉNTICO A LA IMAGEN
    const msgFinal = `✨ TARJETA REGALO SPICY INK ✨\n━━━━━━━━━━━━━━━━━━━━\n\n👤 Para: ${d.para}\n💰 Valor: ${d.amount}€\n\n✉️ Dedicatoria:\n"${d.msg}"\n\n🎟 CÓDIGO DE CANJE:\n\`${code}\`\n\n━━━━━━━━━━━━━━━━━━━━\nPresenta este código en el estudio para\ncanjear tu regalo.`;

    // Enviar al Usuario
    try { await ctx.telegram.sendMessage(d.cid, msgFinal, {parse_mode:'Markdown'}); } catch(e){}
    
    // Enviar Copia al Admin (como solicitaste)
    try { await ctx.telegram.sendMessage(MI_ID, `🔔 **COPIA GENERADA:**\n${msgFinal}`, {parse_mode:'Markdown'}); } catch(e){}

    ctx.editMessageText(`✅ **PAGO ACEPTADO Y GENERADO**\nCódigo: ${code}`);
});

bot.action(/^no_(.+)$/, async (ctx) => {
    const pid = ctx.match[1];
    const d = db.tarjetas_pendientes[pid];
    if(d) {
        try { await ctx.telegram.sendMessage(d.cid, "❌ **PAGO RECHAZADO**\nContacta con el admin."); } catch(e){}
        delete db.tarjetas_pendientes[pid];
        guardar();
    }
    ctx.editMessageText('❌ RECHAZADO');
});

const diccionarioScene = new Scenes.WizardScene('diccionario-scene', (ctx) => { ctx.reply('📚 Símbolo:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Significado: ...'); return ctx.scene.leave(); });
const probadorScene = new Scenes.WizardScene('probador-scene', (ctx) => { ctx.reply('📸 Foto:'); return ctx.wizard.next(); }, (ctx) => { ctx.reply('Diseñando...'); return ctx.scene.leave(); });
const cumpleScene = new Scenes.WizardScene('cumple-scene', (ctx) => { ctx.reply('Fecha:'); return ctx.wizard.next(); }, (ctx) => { db.cumples[ctx.from.id] = ctx.message.text; guardar(); ctx.reply('Guardado.'); return ctx.scene.leave(); });

const stage = new Scenes.Stage([tattooScene, mineScene, iaScene, canjeWizard, citaWizard, probadorScene, diccionarioScene, panicoScene, regaloScene, cumpleScene, broadcastScene, couponScene, reminderScene, adminGiftScene]);
bot.use(session());
bot.use(stage.middleware());

// ==========================================
// 5. HANDLERS PRINCIPALES
// ==========================================
bot.start((ctx) => {
    notificarAdmin(ctx, '🚀 START');
    return irAlMenuPrincipal(ctx);
});

function irAlMenuPrincipal(ctx) {
    if (db.mantenimiento && ctx.from.id.toString() !== MI_ID.toString()) return ctx.reply('🛠️ Mantenimiento.');
    const uid = ctx.from.id;
    const pts = db.puntos[uid] || 0;
    const txt = `✨ S P I C Y I N K ✨\n━━━━━━━━━━━━━━━━━━━━\n👤 **ID:** \`${uid}\`\n💎 **Puntos:** ${pts}\n━━━━━━━━━━━━━━━━━━━━`;
    const btns = [['🔥 Cita / Presupuesto', '🎮 Zona Fun'], ['🚑 SOS & Cuidados', '💎 Club VIP'], ['🎁 Tarjetas Regalo', '👤 Mi Perfil']];
    if (String(uid) === String(MI_ID)) btns.push(['📊 Panel Admin']);
    return ctx.reply(txt, { parse_mode: 'Markdown', ...Markup.keyboard(btns).resize() });
}

bot.hears('🔥 Cita / Presupuesto', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('🎁 Tarjetas Regalo', (ctx) => ctx.scene.enter('regalo-scene'));

// --- INVENTARIO DE USUARIO ACTUALIZADO ---
bot.hears('👤 Mi Perfil', (ctx) => {
    const uid = ctx.from.id;
    const inv = db.inventario[uid] || [];
    
    // Buscar Tarjetas de este usuario
    const misTarjetas = Object.entries(db.tarjetas_regalo)
        .filter(([code, data]) => String(data.comprador) === String(uid) || String(data.cid) === String(uid))
        .map(([code, data]) => {
            const estado = data.canjeado ? '🔴 Usado' : '🟢 Activo';
            return `💳 \`${code}\` (${data.amount}€) - ${estado}`;
        });

    let m = `👤 **PERFIL DE USUARIO**\n\n`;
    
    // Sección Ruleta
    m += `🎒 **Premios Ruleta:**\n`;
    if(inv.length===0) m+="(Ninguno)\n";
    else inv.forEach(p => m+=`🎁 ${p.premio}\n`);

    // Sección Tarjetas
    m += `\n💳 **Mis Tarjetas Compradas:**\n`;
    if(misTarjetas.length === 0) m+="(Ninguna)";
    else m += misTarjetas.join('\n');

    ctx.reply(m, {parse_mode:'Markdown'});
});
// ----------------------------------------

bot.hears('🎮 Zona Fun', (ctx) => ctx.reply('🎢 **ZONA FUN**', Markup.keyboard([['🎰 Tirar Ruleta', '🤖 IA: ¿Qué me tatuo?'], ['📚 Diccionario', '🕶️ Probador 2.0'], ['⬅️ Volver']]).resize()));
bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); ctx.scene.enter('ia-wizard'); });

bot.hears('💎 Club VIP', (ctx) => ctx.reply('💎 **VIP**', Markup.inlineKeyboard([
    [Markup.button.callback('💉 Minar', 'ir_minar')],
    [Markup.button.callback('👥 Referidos', 'ver_ref')],
    [Markup.button.callback('📅 Cumple', 'set_cumple')]
])));
bot.action('ir_minar', (ctx) => { ctx.answerCbQuery(); ctx.scene.enter('mine-scene'); });
bot.action('ver_ref', (ctx) => { ctx.reply(`🔗 https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`); ctx.answerCbQuery(); });
bot.action('set_cumple', (ctx) => { ctx.answerCbQuery(); ctx.scene.enter('cumple-scene'); });

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => ctx.scene.enter('ia-wizard'));
bot.hears('🎰 Tirar Ruleta', (ctx) => ctx.reply('👇 JUGAR 👇', Markup.inlineKeyboard([[Markup.button.webApp('🚀 ABRIR', `${URL_WEB}/ruleta`)]])));

bot.hears('🚑 SOS & Cuidados', (ctx) => ctx.reply('🏥 **CUIDADOS**', Markup.inlineKeyboard([
    [Markup.button.callback('🚨 PÁNICO', 'sos_panico'), Markup.button.callback('⏰ Alarma', 'sos_alarma')],
    [Markup.button.callback('🩸 Dolor', 'sos_dolor'), Markup.button.callback('🧼 Guía', 'sos_guia')],
    [Markup.button.callback('⬅️ Volver', 'sos_volver')]
])));
bot.action('sos_panico', (ctx) => { ctx.answerCbQuery(); ctx.scene.enter('panico-scene'); });
bot.action('sos_alarma', (ctx) => { ctx.reply('🔔 Alarma activada.'); ctx.answerCbQuery(); });
bot.action('sos_dolor', (ctx) => ctx.reply('Dolor: Costillas 9/10, Brazo 4/10'));
bot.action('sos_guia', (ctx) => ctx.reply('Lavar, Secar, Crema.'));
bot.action('sos_volver', (ctx) => { ctx.deleteMessage(); irAlMenuPrincipal(ctx); });

bot.hears('⬅️ Volver', (ctx) => irAlMenuPrincipal(ctx));

bot.on('web_app_data', (ctx) => {
    const uid = String(ctx.from.id);
    const hoy = new Date().toDateString();
    if(db.sanciones[uid] > Date.now()) return ctx.reply('🚫 Sancionado.');
    if(db.ultima_ruleta[uid] === hoy) {
        db.sanciones[uid] = Date.now() + 172800000; guardar();
        return ctx.reply('🚨 **TRAMPA** Sancionado 2 días.');
    }
    const d = JSON.parse(ctx.webAppData.data);
    db.ultima_ruleta[uid] = hoy;
    if(!d.premio.includes("SIGUE")) {
        if(!db.inventario[uid]) db.inventario[uid]=[];
        db.inventario[uid].push({premio: d.premio, fecha: Date.now()});
        ctx.reply(`🎉 Ganaste: ${d.premio}`);
    } else ctx.reply('💨 Suerte mañana.');
    guardar();
});

// ==========================================
// SECCIÓN ADMIN ACTUALIZADA
// ==========================================
bot.hears('📊 Panel Admin', (ctx) => {
    if(String(ctx.from.id) !== String(MI_ID)) return;
    ctx.reply('🛠️ **ADMIN**', Markup.inlineKeyboard([
        [Markup.button.callback('👥 Usuarios', 'adm_users'), Markup.button.callback('🎟️ Cupón', 'adm_cup')],
        [Markup.button.callback('📢 Difusión', 'adm_broad'), Markup.button.callback('⏰ Recordatorio', 'adm_rem')],
        [Markup.button.callback('🗂️ Inventario Citas', 'adm_citas_list')],
        [Markup.button.callback('🎁 Gestión Tarjetas Regalo', 'adm_gifts')],
        [Markup.button.callback('📅 Agendar Cita', 'admin_cita')],
        [Markup.button.callback('⬅️ Volver', 'adm_back')]
    ]));
});

// Handlers de la sección Admin
bot.action('adm_users', (ctx) => { ctx.reply(`Usuarios: ${Object.keys(db.fichas).length}`); ctx.answerCbQuery(); });
bot.action('adm_back', (ctx) => { ctx.deleteMessage(); irAlMenuPrincipal(ctx); });
bot.action('adm_broad', (ctx) => ctx.scene.enter('broadcast-wizard'));
bot.action('adm_cup', (ctx) => ctx.scene.enter('coupon-wizard'));
bot.action('adm_rem', (ctx) => ctx.scene.enter('reminder-wizard'));
bot.action('admin_cita', (ctx) => ctx.scene.enter('cita-wizard'));
bot.action('adm_citas_list', (ctx) => {
    const list = db.citas.filter(c => c.fecha > Date.now()).map(c => `📅 ${c.fechaTexto} - ${c.nombre}`).join('\n');
    ctx.reply(list || "Vacío."); ctx.answerCbQuery();
});

// --- SUBMENÚ GESTIÓN TARJETAS REGALO ---
bot.action('adm_gifts', (ctx) => {
    ctx.editMessageText('🎁 **GESTIÓN TARJETAS REGALO**\nSelecciona una opción:', Markup.inlineKeyboard([
        [Markup.button.callback('📜 Ver Lista Completa', 'adm_gift_list')],
        [Markup.button.callback('🔎 Buscar y Canjear', 'adm_gift_redeem')],
        [Markup.button.callback('⬅️ Volver Admin', 'adm_back_panel')]
    ]));
});

bot.action('adm_back_panel', (ctx) => {
    ctx.deleteMessage();
    ctx.reply('🛠️ **ADMIN**', Markup.inlineKeyboard([
        [Markup.button.callback('👥 Usuarios', 'adm_users'), Markup.button.callback('🎟️ Cupón', 'adm_cup')],
        [Markup.button.callback('📢 Difusión', 'adm_broad'), Markup.button.callback('⏰ Recordatorio', 'adm_rem')],
        [Markup.button.callback('🗂️ Inventario Citas', 'adm_citas_list')],
        [Markup.button.callback('🎁 Gestión Tarjetas Regalo', 'adm_gifts')],
        [Markup.button.callback('📅 Agendar Cita', 'admin_cita')],
        [Markup.button.callback('⬅️ Volver', 'adm_back')]
    ]));
});

// --- LISTADO GLOBAL (Admin ve todo + importes) ---
bot.action('adm_gift_list', (ctx) => {
    const codes = Object.entries(db.tarjetas_regalo);
    if (codes.length === 0) return ctx.reply('❌ No hay tarjetas generadas aún.');
    
    let msg = '📜 **INVENTARIO GLOBAL DE TARJETAS**\n\n';
    // Ordenar: primero las no canjeadas
    codes.sort((a, b) => (a[1].canjeado === b[1].canjeado) ? 0 : a[1].canjeado ? 1 : -1);

    codes.forEach(([code, data]) => {
        const icon = data.canjeado ? '🔴' : '🟢';
        const estado = data.canjeado ? 'Usado' : 'Activo';
        msg += `${icon} \`${code}\`\n   💰 **${data.amount}€** | 👤 ${data.para}\n\n`;
    });
    
    if (msg.length > 4000) msg = msg.substring(0, 4000) + '... (lista cortada)';
    
    ctx.reply(msg, { parse_mode: 'Markdown' });
    ctx.answerCbQuery();
});

bot.action('adm_gift_redeem', (ctx) => {
    ctx.answerCbQuery();
    ctx.scene.enter('admin-gift-wizard');
});
// ----------------------------------------

setInterval(() => {
    const now = Date.now();
    db.citas.forEach(c => {
        if(!c.avisado24h && c.fecha - now > 0 && c.fecha - now <= 86400000) {
            bot.telegram.sendMessage(c.clienteId, `⏰ Mañana cita: ${c.fechaTexto}`).catch(()=>{});
            bot.telegram.sendMessage(MI_ID, `🔔 Cita mañana: ${c.nombre}`).catch(()=>{});
            c.avisado24h = true; guardar();
        }
    });
}, 60000);

bot.launch().then(() => console.log('🚀 V24 FINAL START'));
