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
server.listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID; 

// ==========================================
// 2. BASE DE DATOS LOCAL (PARA RENDER)
// ==========================================
let db = { clics: {}, referidos: {}, confirmados: {}, invitados: {}, fichas: {} };
const DATA_FILE = path.join('/tmp', 'database.json');

if (fs.existsSync(DATA_FILE)) {
    try { 
        const contenido = fs.readFileSync(DATA_FILE, 'utf-8');
        db = JSON.parse(contenido);
        if (!db.fichas) db.fichas = {};
    } catch (e) { console.log("Error al cargar DB"); }
}

function guardar() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) { console.log("Error al guardar"); }
}

// ==========================================
// 3. UTILIDADES DE TRADUCCIÓN PARA IA
// ==========================================
function traducirTerminos(texto) {
    if (!texto) return "";
    const diccionario = {
        'blanco y negro': 'black and gray',
        'color': 'full color',
        'antebrazo': 'forearm',
        'bíceps': 'biceps',
        'hombro': 'shoulder',
        'costillas': 'ribs',
        'esternón': 'sternum',
        'espalda': 'back',
        'muslo': 'thigh',
        'gemelo': 'calf',
        'tobillo': 'ankle',
        'mano': 'hand',
        'cuello': 'neck',
        'muñeca': 'wrist',
        'realismo': 'photorealistic',
        'fine line': 'ultra fine line',
        'blackwork': 'heavy blackwork',
        'lettering': 'custom calligraphy'
    };
    let traducido = texto.toLowerCase();
    for (const [es, en] of Object.entries(diccionario)) {
        traducido = traducido.replace(new RegExp(es, 'g'), en);
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
// 5. MENÚ PRINCIPAL
// ==========================================
function irAlMenuPrincipal(ctx) {
    return ctx.reply('✨ S P I C Y  I N K ✨\n━━━━━━━━━━━━━━━━━━━━\nGestión de citas y eventos exclusivos.\n\nSelecciona una opción:',
        Markup.keyboard([
            ['🔥 Hablar con el Tatuador', '💉 Minar Tinta'],
            ['💡 Consultar Ideas', '🤖 IA: ¿Qué me tatuo?'],
            ['👥 Mis Referidos', '🧼 Cuidados'],
            ['🎁 Sorteos']
        ]).resize()
    );
}

// ==========================================
// 6. ESCENAS
// ==========================================

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
        ctx.reply('🎨 Selecciona el Estilo:', 
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
        
        const fichaAdmin = `🔔 **NUEVA SOLICITUD**\n━━━━━━━━━━━━━━━━━━━━\n👤 **Nombre:** ${d.nombre}\n🔞 **Edad:** ${d.edad}\n📍 **Zona:** ${d.zona}\n📏 **Tamaño:** ${d.tamano}\n🎨 **Estilo:** ${d.estilo}\n🏥 **Salud:** ${d.salud}\n📞 **WhatsApp:** +${d.telefono}\n\n💰 **${estimacion.split('\n')[0]}**`;
        
        await ctx.telegram.sendMessage(MI_ID, fichaAdmin, Markup.inlineKeyboard([
            [Markup.button.url('📲 Hablar por WhatsApp', `https://wa.me/${d.telefono}`)]
        ]));
        if (d.foto) await ctx.telegram.sendPhoto(MI_ID, d.foto, { caption: `🖼️ Referencia de ${d.nombre}` });

        await ctx.reply(`✅ SOLICITUD ENVIADA\n━━━━━━━━━━━━━━━━━━━━\n${estimacion}`);
        return ctx.scene.leave();
    }
);

// --- ESCENA DE IA (PROMPT PROFESIONAL + BOTÓN COPIAR) ---
const iaScene = new Scenes.WizardScene('ia-wizard',
    (ctx) => {
        ctx.wizard.state.ai = {};
        ctx.reply('🤖 **DISEÑADOR IA (1/10)**\n¿Cuál es el elemento principal? (Ej: Un guerrero samurái)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.elemento = ctx.message.text;
        ctx.reply('**(2/10)** ¿Qué postura o acción tiene? (Ej: De perfil, atacando, sentado...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.accion = ctx.message.text;
        ctx.reply('**(3/10)** ¿Qué hay al fondo? (Ej: Círculo zen, nubes, geometría, fondo blanco...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.fondo = ctx.message.text;
        ctx.reply('**(4/10)** ¿Cómo es la iluminación? (Ej: Luz dramática, sombras duras, luz suave...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.luz = ctx.message.text;
        ctx.reply('**(5/10)** ¿Nivel de detalle? (Ej: Micro-realismo, trazos gruesos, boceto...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.detalle = ctx.message.text;
        ctx.reply('**(6/10)** ¿Color o B/N?', Markup.keyboard([['Blanco y Negro', 'Color']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.color = ctx.message.text;
        ctx.reply('**(7/10)** ¿Objetos secundarios? (Ej: Flores de loto, serpientes, fuego...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.extra = ctx.message.text;
        ctx.reply('**(8/10)** ¿Tipo de trazo? (Ej: Fine line, puntillismo, sombreado suave...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.lineas = ctx.message.text;
        ctx.reply('**(9/10)** ¿Composición? (Ej: Diseño vertical, envolvente, simétrico...)');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.ai.forma = ctx.message.text;
        ctx.reply('**(10/10)** ¿Qué atmósfera buscas? (Ej: Mística, agresiva, melancólica...)');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const ai = ctx.wizard.state.ai;
        ai.sentimiento = ctx.message.text;
        
        const f = db.fichas[ctx.from.id] || { zona: "body", estilo: "artistic" };

        const prompt = `Professional tattoo flash design of ${ai.elemento}, ${ai.accion}. Background: ${ai.fondo}. Lighting: ${ai.luz}. Detail: ${ai.detalle}. Palette: ${traducirTerminos(ai.color)}. Elements: ${ai.extra}. Linework: ${ai.lineas}. Composition: ${ai.forma}. Mood: ${ai.sentimiento}. Optimized for ${traducirTerminos(f.zona)} in ${traducirTerminos(f.estilo)} style. 8k resolution, high contrast, clean white background, master quality.`;
        
        const encodedPrompt = encodeURIComponent(`Genera una imagen de tatuaje con este prompt en inglés: ${prompt}`);
        const geminiUrl = `https://gemini.google.com/app?q=${encodedPrompt}`;
        
        // Link de copia rápida
        const copyUrl = `https://t.me/share/url?url=${encodeURIComponent(prompt)}&text=Copia%20este%20prompt%20para%20tu%20IA:`;

        const msgExtra = `\n\n💬 Copia y pega el comando anterior dentro de este enlace, que es la IA que usa el tatuador por el procesamiento **NanoBananaIA**. También puedes usar cualquier otra IA. La mía es gratuita y permite hasta 50 imágenes al día.`;

        await ctx.reply(`🧠 **DISEÑO IA GENERADO**\n━━━━━━━━━━━━━━━━━━━━\n<code>${prompt}</code>${msgExtra}`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📋 COPIAR PROMPT', copyUrl)],
                [Markup.button.url('🎨 GENERAR EN GEMINI', geminiUrl)],
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
// 7. MIDDLEWARES Y LANZAMIENTO
// ==========================================
const stage = new Scenes.Stage([tattooScene, mineScene, ideasScene, iaScene]);
bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => irAlMenuPrincipal(ctx));

bot.hears('🤖 IA: ¿Qué me tatuo?', (ctx) => {
    if (!db.fichas[ctx.from.id]) {
        return ctx.reply('🤖 **BLOQUEO DE IA**\nNecesito conocer tu estilo primero.\n\n¿Has enviado ya tu ficha?',
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Sí, enviarla ahora', 'ir_a_formulario')],
                [Markup.button.callback('❌ No, volver', 'volver_ia')]
            ])
        );
    }
    return ctx.scene.enter('ia-wizard');
});

bot.action('nueva_ia', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('ia-wizard'); });
bot.action('ir_a_formulario', (ctx) => { ctx.answerCbQuery(); return ctx.scene.enter('tattoo-wizard'); });
bot.action('volver_ia', (ctx) => { ctx.answerCbQuery(); return ctx.editMessageText('Vuelve cuando quieras.'); });

bot.hears('🔥 Hablar con el Tatuador', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💉 Minar Tinta', (ctx) => ctx.scene.enter('mine-scene'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('🧼 Cuidados', (ctx) => ctx.reply('Jabón neutro y crema 3 veces al día.'));
bot.hears('🎁 Sorteos', (ctx) => ctx.reply('🎁 SORTEO ACTIVO: https://t.me/+bAbJXSaI4rE0YzM0'));

bot.launch().then(() => console.log('🚀 Bot Funcionando'));

// Evitar caídas en Render
process.on('unhandledRejection', (reason) => console.log('Unhandled:', reason));
process.on('uncaughtException', (err) => console.log('Exception:', err));
