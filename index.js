require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==========================================
// 1. CONFIGURACIÓN DEL SERVIDOR
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Tatuador Online ✅');
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
    fichas: {}, puntos: {}, cupones: {}, mantenimiento: false 
};

// AJUSTE: Usamos el directorio local para evitar errores de permisos
const DATA_FILE = path.join(__dirname, 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.fichas) db.fichas = {};
        if (!db.puntos) db.puntos = {};
        if (!db.cupones) db.cupones = {};
        if (db.mantenimiento === undefined) db.mantenimiento = false;
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. UTILIDADES DE TRADUCCIÓN PROFUNDA PARA IA
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray', 'color': 'full color', 'realismo': 'photorealistic',
        'fine line': 'ultra fine line', 'blackwork': 'heavy blackwork', 'lettering': 'custom calligraphy',
        'tradicional': 'old school traditional', 'neotradicional': 'neo-traditional', 'acuarela': 'watercolor style',
        'puntillismo': 'dotwork style', 'antebrazo': 'forearm', 'bíceps': 'biceps', 'biceps': 'biceps',
        'hombro': 'shoulder', 'costillas': 'ribs', 'esternón': 'sternum', 'esternon': 'sternum',
        'espalda': 'back', 'muslo': 'thigh', 'gemelo': 'calf', 'tobillo': 'ankle', 'mano': 'hand',
        'cuello': 'neck', 'muñeca': 'wrist', 'rodilla': 'knee', 'cara': 'face', 'pies': 'feet',
        'columna': 'spine', 'codo': 'elbow', 'axila': 'armpit', 'lobo': 'wolf', 'león': 'lion',
        'leon': 'lion', 'tigre': 'tiger', 'serpiente': 'snake', 'dragón': 'dragon', 'dragon': 'dragon',
        'águila': 'eagle', 'aguila': 'eagle', 'búho': 'owl', 'buho': 'owl', 'calavera': 'skull',
        'catrina': 'sugar skull catrina', 'mariposa': 'butterfly', 'fénix': 'phoenix', 'fenix': 'phoenix',
        'carpa koi': 'koi fish', 'samurái': 'samurai', 'samurai': 'samurai', 'aullando': 'howling',
        'saltando': 'leaping', 'rugiendo': 'roaring', 'corriendo': 'running', 'volando': 'flying',
        'mirando de frente': 'frontal view pose', 'perfil': 'side profile view', 'posición de alerta': 'alert stance',
        'agazapado': 'crouching', 'ataque': 'attacking pose', 'bosque': 'deep forest', 'sabana': 'savannah',
        'selva': 'jungle', 'nubes': 'ethereal clouds', 'mandalas': 'intricate mandala patterns',
        'fondo limpio': 'clean solid background', 'montañas': 'mountains', 'mar': 'ocean waves',
        'espacio': 'outer space stars', 'geometría': 'geometric patterns', 'cielo despejado': 'clear sky',
        'luz dramática': 'dramatic high-contrast lighting', 'luz dramatica': 'dramatic high-contrast lighting',
        'sombras suaves': 'soft_smooth shading', 'alto contraste': 'high contrast cinematic lighting',
        'hiperrealista': 'hyper-realistic masterpiece, extreme macro photography detail, 8k resolution, ultra-detailed skin textures, depth of field, sharp focus, cinematic volumetric lighting',
        'minimalista': 'clean minimalist', 'muy sombreado': 'heavy atmospheric shading', 'microrealismo': 'micro-realism',
        'rosas': 'blooming roses', 'flores': 'flowers', 'dagas': 'sharp daggers', 'espada': 'sword',
        'fuego': 'burning flames', 'reloj': 'pocket watch', 'brújula': 'compass', 'brujula': 'compass',
        'corona': 'crown', 'alas': 'angel wings', 'nada': 'none', 'línea fina': 'fine-line work',
        'linea fina': 'fine-line work', 'línea gruesa': 'bold traditional lines', 'linea gruesa': 'bold traditional lines',
        'sin líneas': 'no-outline 3D style', 'sin lineas': 'no-outline 3D style', 'fotorealista': 'photorealistic rendering',
        'vertical alargado': 'vertical elongated', 'circular': 'circular composition', 'diamante': 'diamond-shaped frame',
        'al gusto': 'custom artistic composition', 'natural': 'natural flow', 'oscuridad': 'dark moody gothic atmosphere',
        'paz': 'serene and peaceful vibe', 'fuerza': 'powerful and aggressive energy', 'elegancia': 'elegant and sophisticated style',
        'misterio': 'mysterious aura', 'tristeza': 'melancholic feel', 'libertad': 'sense of freedom',
        'fuerza, oscuridad': 'powerful energy and dark atmosphere'
    };

    let traducido = texto.toLowerCase().trim();
    for (const [es, en] of Object.entries(diccionario)) {
        const regex = new RegExp(`\\b${es}\\b`, 'g');
        traducido = traducido.replace(regex, en);
    }
    return traducido;
}

// ==========================================
// 4. LÓGICA DE PRESUPUESTO DINÁMICA
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
// 5. MENÚ PRINCIPAL (BOTONES DINÁMICOS)
// ==========================================
function irAlMenuPrincipal(ctx) {
    if (db.mantenimiento && ctx.from.id.toString() !== MI_ID.toString()) {
        return ctx.reply('🛠️ **MODO MANTENIMIENTO**\n\nEstamos mejorando el bot para ti. Volvemos en unos minutos.');
    }

    const uid = ctx.from.id;
    const pts = db.puntos[uid] || 0;
    
    let botones = [
        ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
        ['🏷️ Promociones', '💎 Club de Afiliados'],
        ['💡 Consultar Ideas', '⚜️TattooAI⚜️'],
        ['👥 Mis Referidos', '🧼 Cuidados'],
        ['🎁 Sorteos']
    ];

    if (uid.toString() === MI_ID.toString()) {
        botones.push(['📊 Panel de Control']);
    }

    return ctx.reply(`✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\n👤 **Tu ID:** \`${uid}\`\n💎 **Puntos:** \`${pts} pts\`\n━━━━━━━━━━━━━━━━━━━━\nSelecciona una opción:`,
        Markup.keyboard(botones).resize()
    );
}

// Función auxiliar para detectar comandos y cancelar wizard
const checkCmd = (ctx) => {
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
        ctx.scene.leave();
        irAlMenuPrincipal(ctx);
        return true;
    }
    return false;
};

// ==========================================
// 6. ESCENAS
// ==========================================

const couponScene = new Scenes.WizardScene('coupon-wizard',
    (ctx) => { ctx.reply('🎟️ **GENERADOR DE CUPONES**\nEscribe el código del cupón (ej: PROMO20):'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.code = ctx.message.text.toUpperCase(); ctx.reply('¿Cuántos puntos otorga este cupón?'); return ctx.wizard.next(); },
    (ctx) => { 
        db.cupones[ctx.wizard.state.code] = parseInt(ctx.message.text); 
        guardar();
        ctx.reply(`✅ Cupón \`${ctx.wizard.state.code}\` creado con valor de ${ctx.message.text} pts.`);
        return ctx.scene.leave();
    }
);

const broadcastScene = new Scenes.WizardScene('broadcast-wizard',
    (ctx) => { ctx.reply('📢 **PROGRAMADOR DE MENSAJES**\nEscribe el mensaje que quieres enviar a TODOS los usuarios:'); return ctx.wizard.next(); },
    async (ctx) => {
        const msg = ctx.message.text;
        const ids = Object.keys(db.puntos);
        ctx.reply(`Iniciando envío a ${ids.length} usuarios...`);
        for (const id of ids) {
            try { await ctx.telegram.sendMessage(id, `📢 **AVISO IMPORTANTE:**\n\n${msg}`); } catch(e){}
        }
        ctx.reply('✅ Difusión completada.');
        return ctx.scene.leave();
    }
);

const reminderScene = new Scenes.WizardScene('reminder-wizard',
    (ctx) => { ctx.reply('⏰ **RECORDATORIO DE CITA**\nIntroduce el ID del usuario:'); return ctx.wizard.next(); },
    (ctx) => { ctx.wizard.state.uid = ctx.message.text; ctx.reply('Escribe la fecha y hora (ej: Mañana a las 10:00):'); return ctx.wizard.next(); },
    async (ctx) => {
        try {
            await ctx.telegram.sendMessage(ctx.wizard.state.uid, `⏰ **RECORDATORIO DE CITA**\n━━━━━━━━━━━━━━━━━━━━\nHola! Te recordamos tu cita para tatuarte:\n📅 **${ctx.message.text}**\n\n¡Te esperamos en el estudio! 💉`);
            ctx.reply('✅ Recordatorio enviado con éxito.');
        } catch(e) { ctx.reply('❌ Error al enviar. ¿El ID es correcto?'); }
        return ctx.scene.leave();
    }
);

const mineScene = new Scenes.BaseScene('mine-scene');
mineScene.enter((ctx) => {
    const uid = ctx.from.id;
    ctx.reply(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid] || 0} / 1000 ml\n🎁 PREMIO: TATTOO 20€\n\nPulsa para recolectar:`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]]));
});
mineScene.action('minar_punto', async (ctx) => {
    const uid = ctx.from.id;
    db.clics[uid] = (db.clics[uid] || 0) + 1;
    guardar();
    if (db.clics[uid] >= 1000) {
        await ctx.editMessageText('🎉 TANQUE COMPLETADO 🎉\nHas ganado tu tatuaje por 20€. Haz captura para canjear.');
        db.clics[uid] = 0; guardar(); return;
    }
    try { await ctx.editMessageText(`💉 M I N E R Í A  D E  T I N T A\n━━━━━━━━━━━━━━━━━━━━\nEstado: ${db.clics[uid]} / 1000 ml\n🎁 PREMIO: TATTOO 20€`,
        Markup.inlineKeyboard([[Markup.button.callback('💉 INYECTAR TINTA', 'minar_punto')], [Markup.button.callback('⬅️ SALIR', 'volver_menu')]])); } catch (e) {}
    return ctx.answerCbQuery();
});
mineScene.action('volver_menu', async (ctx) => { await ctx.scene.leave(); return irAlMenuPrincipal(ctx); });

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

// ==========================================
// SCENE IA CORREGIDA
// ==========================================
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => {
        ctx.wizard.state.ai = {};
        ctx.reply('🎨 Selecciona el estilo de tatuaje que buscas:', 
            Markup.keyboard([
                ['⚡ Flash Tattoo', '🚬 Estilo Chicano'],
                ['✨ Personalizado', '⬅️ Volver al Menú']
            ]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        if (ctx.message.text === '⬅️ Volver al Menú') {
            ctx.scene.leave();
            return irAlMenuPrincipal(ctx);
        }
        // Limpiamos los emojis del estilo para que no rompan el prompt
        const rawStyle = ctx.message.text;
        const cleanStyle = rawStyle.replace(/[⚡🚬✨]/g, '').trim(); 
        
        ctx.wizard.state.ai.modo = cleanStyle;
        ctx.reply('⚜️TattooAI⚜️ (1/10)\n¿Cuál es el elemento principal? (Ej: Un lobo, una calavera...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.elemento = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(2/10) ¿Qué está haciendo o en qué postura está? (Ej: Aullando, saltando...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.accion = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(3/10) ¿Qué hay de fondo? (Ej: Bosque, nubes, mandalas...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.fondo = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(4/10) ¿Cómo es la iluminación? (Ej: Luz dramática, sombras suaves...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.luz = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(5/10) ¿Nivel de detalle? (Ej: Hiperrealista, minimalista...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.detalle = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(6/10) ¿Gama de colores?', 
            Markup.keyboard([['Blanco y Negro', 'Color'], ['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.color = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(7/10) ¿Algún elemento extra? (Ej: Rosas, dagas, fuego...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.extra = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(8/10) ¿Tipo de línea? (Ej: Línea fina, línea gruesa...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.lineas = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(9/10) ¿Composición/Forma? (Ej: Vertical, circular...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (checkCmd(ctx)) return;
        ctx.wizard.state.ai.forma = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        ctx.reply('(10/10) ¿Qué sensación debe transmitir? (Ej: Oscuridad, paz...)', 
            Markup.keyboard([['⏭️ Saltar']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (checkCmd(ctx)) return;
        const ai = ctx.wizard.state.ai;
        ai.sentimiento = (ctx.message.text === '⏭️ Saltar') ? 'none' : ctx.message.text;
        const f = db.fichas[ctx.from.id] || { zona: "body", estilo: "artistic" };
        
        // FUNCIÓN MEJORADA: Solo añade el texto si no es 'none' y añade la etiqueta correcta
        const append = (label, val) => {
            if (!val || val === 'none' || val === '⏭️ Saltar') return '';
            return `${label}: ${traducirTerminos(val)}. `;
        };

        // Construcción limpia del prompt sin puntos vacíos
        let promptParts = `Professional tattoo design in ${ai.modo} style. `;
        promptParts += append('Featuring', ai.elemento);
        promptParts += append('Action/Pose', ai.accion);
        promptParts += append('Background', ai.fondo);
        promptParts += append('Lighting', ai.luz);
        promptParts += append('Detail', ai.detalle);
        promptParts += append('Palette', ai.color);
        promptParts += append('Elements', ai.extra);
        promptParts += append('Linework', ai.lineas);
        promptParts += append('Composition', ai.forma);
        promptParts += append('Mood', ai.sentimiento);
        
        const finalPrompt = `${promptParts} Optimized for ${traducirTerminos(f.zona)}. 8k, high contrast, clean white background, master quality.`;
        
        const encodedPrompt = encodeURIComponent(`Genera una imagen de tatuaje con este prompt en inglés: ${finalPrompt}`);
        const geminiUrl = `https://gemini.google.com/app?q=${encodedPrompt}`;
        
        await ctx.reply(`🧠 **PROMPT PROFESIONAL GENERADO**\n━━━━━━━━━━━━━━━━━━━━\n<code>${finalPrompt}</code>`, {
            parse_mode: 'HTML',
            ...Markup.removeKeyboard(),
            ...Markup.inlineKeyboard([
                [Markup.button.url('🎨 GENERAR EN GOOGLE GEMINI', geminiUrl)],
                [Markup.button.callback('🔄 Otra idea', 'nueva_ia')]
            ])
        });
        return ctx.scene.leave();
    }
);

const ideasScene = new Scenes.WizardScene('ideas-scene',
    (ctx) => {
        ctx.reply('💡 Selecciona una zona:', Markup.keyboard([['Antebrazo', 'Bíceps'], ['Costillas', 'Espalda'], ['⬅️ Volver']]).resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const msg = ctx.message.text;
        if (msg.includes('Volver')) { ctx.scene.leave(); return irAlMenuPrincipal(ctx); }
        ctx.reply("💡 Consejo: " + msg + " es una zona excelente para este tipo de diseños.");
        ctx.scene.leave(); return irAlMenuPrincipal(ctx);
    }
);

// ==========================================
// 7. MIDDLEWARES Y REGISTRO
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene, iaScene, couponScene, broadcastScene, reminderScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const text = ctx.message.text || '';
    if (text.includes('start=')) {
        const inviterId = text.split('=')[1];
        if (inviterId != ctx.from.id && !db.invitados[ctx.from.id]) {
            db.invitados[ctx.from.id] = inviterId;
            db.referidos[inviterId] = (db.referidos[inviterId] || 0) + 1;
            guardar();
            ctx.telegram.sendMessage(inviterId, `👥 ¡Alguien se ha unido con tu enlace!`);
        }
    }
    return irAlMenuPrincipal(ctx);
});

bot.hears('🏷️ Promociones', (ctx) => {
    return ctx.reply('🏷️ **CANAL DE PROMOCIONES**\n━━━━━━━━━━━━━━━━━━━━\nÚnete para recibir ofertas flash y descuentos mensuales.', 
        Markup.inlineKeyboard([[Markup.button.url('📲 Entrar al Grupo', 'https://t.me/+rnjk7xiUjFhlMzdk')]]));
});

bot.hears('💎 Club de Afiliados', (ctx) => {
    const uid = ctx.from.id;
    const pts = db.puntos[uid] || 0;
    const texto = `💎 **SISTEMA DE PUNTOS VIP**\n━━━━━━━━━━━━━━━━━━━━\nPor cada tatuaje realizado sumas puntos para premios.\n\n💰 **Tus puntos actuales:** \`${pts} Puntos\`\n\n🏆 **TABLA DE PREMIOS:**\n• 5 pts: Crema de cuidado gratis\n• 10 pts: 25% DTO en próximo tattoo\n• 20 pts: Tattoo pequeño GRATIS\n\n*Los puntos se asignan en el estudio al terminar tu sesión.*`;
    return ctx.reply(texto, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🎟️ CANJEAR CUPÓN', 'canjear_cupon_usuario')]]) });
});

bot.action('canjear_cupon_usuario', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('🎟️ **MODO CANJE**\n\nEscribe el código de tu cupón a continuación para recibir tus puntos:');
});

bot.on('text', (ctx, next) => {
    const code = ctx.message.text.toUpperCase();
    if (db.cupones && db.cupones[code]) {
        const val = db.cupones[code];
        db.puntos[ctx.from.id] = (db.puntos[ctx.from.id] || 0) + val;
        delete db.cupones[code]; 
        guardar();
        return ctx.reply(`🎉 ¡Cupón aceptado!\n━━━━━━━━━━━━━━━━━━━━\nHas recibido **${val} puntos** en tu cuenta VIP.`);
    }
    return next();
});

bot.command('canjear', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('❌ Uso: /canjear ID PUNTOS');
    const targetId = args[1];
    const ptsToAdd = parseInt(args[2]);
    db.puntos[targetId] = (db.puntos[targetId] || 0) + ptsToAdd;
    guardar();
    ctx.reply(`✅ Puntos actualizados para el usuario ${targetId}.`);
    ctx.telegram.sendMessage(targetId, `🎉 ¡Has recibido ${ptsToAdd} puntos en el Club de Afiliados! Consulta tus puntos en el menú.`);
});

bot.hears('📊 Panel de Control', (ctx) => {
    if (ctx.from.id.toString() !== MI_ID.toString()) return;
    return ctx.reply('🛠️ **PANEL DE ADMINISTRACIÓN**', 
        Markup.inlineKeyboard([
            [Markup.button.callback('👥 Lista Usuarios', 'admin_usuarios'), Markup.button.callback('🎟️ Crear Cupón', 'admin_cupon')],
            [Markup.button.callback('📢 Difusión Global', 'admin_broadcast'), Markup.button.callback('⏰ Recordatorio', 'admin_reminder')],
            [Markup.button.callback(db.mantenimiento ? '🟢 Activar Bot' : '🔴 Mantenimiento', 'admin_mantenimiento')],
            [Markup.button.callback('📜 Consentimiento', 'admin_legal'), Markup.button.callback('⬅️ Volver', 'admin_volver')]
        ]));
});

bot.action('admin_usuarios', (ctx) => {
    const ids = Object.keys(db.puntos);
    if (ids.length === 0) return ctx.reply("Sin usuarios.");
    let lista = "👥 **LISTA:**\n";
    ids.forEach(id => { lista += `• ${db.fichas[id]?.nombre || "Sin nombre"} | ID: \`${id}\` | Pts: ${db.puntos[id] || 0}\n`; });
    return ctx.editMessageText(lista, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Volver', 'admin_panel_back')]]) });
});

bot.action('admin_cupon', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('coupon-wizard'); });
bot.action('admin_broadcast', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('broadcast-wizard'); });
bot.action('admin_reminder', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('reminder-wizard'); });

bot.action('admin_mantenimiento', (ctx) => {
    db.mantenimiento = !db.mantenimiento;
    guardar();
    ctx.answerCbQuery(`Modo mantenimiento: ${db.mantenimiento ? 'ON' : 'OFF'}`);
    return ctx.editMessageText(`🛠️ **PANEL DE ADMINISTRACIÓN**\nEstado: ${db.mantenimiento ? '🔴 MANTENIMIENTO ACTIVO' : '🟢 BOT OPERATIVO'}`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('👥 Lista Usuarios', 'admin_usuarios'), Markup.button.callback('🎟️ Crear Cupón', 'admin_cupon')],
            [Markup.button.callback('📢 Difusión Global', 'admin_broadcast'), Markup.button.callback('⏰ Recordatorio', 'admin_reminder')],
            [Markup.button.callback(db.mantenimiento ? '🟢 Activar Bot' : '🔴 Mantenimiento', 'admin_mantenimiento')],
            [Markup.button.callback('📜 Consentimiento', 'admin_legal'), Markup.button.callback('⬅️ Volver', 'admin_volver')]
        ]));
});

bot.action('admin_legal', (ctx) => {
    return ctx.reply('📜 **GESTOR DE CONSENTIMIENTO**\n━━━━━━━━━━━━━━━━━━━━\nEnvía este mensaje al cliente para que lo firme antes de empezar:\n\n"Yo, el cliente, confirmo que soy mayor de edad (o tengo permiso), no he consumido alcohol/drogas y acepto los riesgos del tatuaje..."');
});

bot.action('admin_panel_back', (ctx) => { ctx.answerCbQuery(); return irAlMenuPrincipal(ctx); });
bot.action('admin_volver', (ctx) => { ctx.answerCbQuery(); return irAlMenuPrincipal(ctx); });

bot.hears('👥 Mis Referidos', (ctx) => {
    const uid = ctx.from.id;
    const conf = db.confirmados[uid] || 0;
    const link = `https://t.me/${ctx.botInfo.username}?start=${uid}`;
    const textoReferidos = `👥 S I S T E M A  D E  S O C I O S\n━━━━━━━━━━━━━━━━━━━━\n🔗 **Tu enlace:**\n${link}\n\n📊 **Confirmados:** ${conf} / 3\n\nRECOMPENSAS EXCLUSIVAS:\nSi 3 personas se tatúan con tu enlace:\n✅ 100% DTO en Tattoos Pequeños\n✅ 100% DTO en Tattoos Medianos\n✅ 50% DTO en Tattoos Grandes`;
    return ctx.reply(textoReferidos, Markup.inlineKeyboard([[Markup.button.callback('✅ ¡ME HE TATUADO!', 'confirmar_tattoo')]]));
});

bot.action('confirmar_tattoo', (ctx) => {
    const inviterId = db.invitados[ctx.from.id];
    if (inviterId) {
        db.confirmados[inviterId] = (db.confirmados[inviterId] || 0) + 1;
        guardar();
        ctx.telegram.sendMessage(inviterId, `🎉 ¡Un referido tuyo se ha tatuado! Tu contador ha subido.`);
        return ctx.answerCbQuery('✅ ¡Gracias por confirmar!', { show_alert: true });
    }
    return ctx.answerCbQuery('❌ No te uniste con enlace de referido.');
});

bot.hears('⚜️TattooAI⚜️', (ctx) => {
    if (!db.fichas[ctx.from.id]) {
        return ctx.reply('🤖 **CONSEJO DE IA**\nSe recomienda enviar tu ficha primero para que el diseño se adapte mejor a tu zona del cuerpo y estilo.\n\n¿Quieres rellenarla ahora o continuar directamente?',
            Markup.inlineKeyboard([[Markup.button.callback('✅ Rellenar Ficha', 'ir_a_formulario')], [Markup.button.callback('🚀 Continuar a la IA', 'continuar_ia')]]));
    }
    return ctx.scene.enter('ia-wizard');
});

bot.action('continuar_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });
bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });
bot.action('ir_a_formulario', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('tattoo-wizard'); });

bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Jabón neutro y crema 3 veces al día.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎁 **SORTEO ACTIVO (05-10 Febrero 2026)**\n━━━━━━━━━━━━━━━━━━━━\n💰 **PREMIO:** 150€\n🎨 **DISEÑO:** A elegir por el cliente\n\n🔗 **ENLACE:** https://t.me/+bAbJXSaI4rE0YzM0', { parse_mode: 'Markdown' }));

bot.launch().then(() => console.log('🚀 Bot Funcionando'));
