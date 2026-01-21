require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR DE SALUD
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot Engine v2.0 - Online ✅');
});
server.listen(process.env.PORT || 3000, () => console.log('🚀 Sistema Profesional SpicyBot Iniciado'));

const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// --- SEGURIDAD & CRONOMETRÍA ---
let CLAVES_DISPONIBLES = ['s7p', 'k82', 'x9w', 'n4m', 'v2t', 'b5z'];
const usuariosAutorizados = new Map(); 
let stats = { visitas: 0, fichas: 0 };

// ==========================================
// ESCENAS PROFESIONALES
// ==========================================

// --- 1. ESCENA DE VALORACIÓN (FEEDBACK) ---
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('🛠 ANÁLISIS DE ERRORES\n¿Has detectado algún fallo, botón roto o error de texto durante tu prueba?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.errores = ctx.message.text;
        ctx.reply('💡 PROPUESTA DE MEJORA\n¿Qué añadirías o cambiarías para que el bot sea más profesional?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('⭐ VALORACIÓN FINAL\n¿Qué nota le das a la experiencia general?', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const data = ctx.wizard.state;
        const inicio = usuariosAutorizados.get(ctx.from.id);
        const tiempoTotal = inicio ? Math.round((Date.now() - inicio) / 1000 / 60) : 0; 

        const reporte = `📊 INFORME DE TESTER PROFESIONAL\n\nUsuario: @${ctx.from.username || 'Sin alias'}\nTiempo: ${tiempoTotal} min\nErrores: ${data.errores}\nMejoras: ${data.mejoras}\nNota: ${nota}/10`;
        
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply(`✅ Análisis enviado con éxito!\n\nHas dedicado ${tiempoTotal} minutos de testeo. Gracias por tu ayuda, hablamos pronto en el estudio. 🖋️`);
        return irAlMenuPrincipal(ctx);
    }
);

// --- 2. ESCENA DE TATUAJE (Lógica de +16 actualizada) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('👋 ASISTENTE DE CITAS\n\n¿Cuál es tu nombre completo?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('🔞 Edad del cliente:', 
            Markup.keyboard([['Soy mayor de 18', 'Tengo entre 16 y 18'], ['Menor de 16']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const edad = ctx.message.text;
        if (edad === 'Menor de 16') {
            ctx.reply('🚫 Aviso: Spicy Inkk no realiza tatuajes a menores de 16 años.');
            return ctx.scene.leave();
        }
        if (edad === 'Tengo entre 16 y 18') {
            ctx.reply('📝 Nota: Podrás tatuarte, pero recuerda que necesitaremos una autorización firmada por tus padres el día de la cita.');
        }
        ctx.wizard.state.formData.edad = edad;
        ctx.reply('🏥 SALUD:\n¿Tienes alergias o tomas medicación?', 
            Markup.keyboard([['No, todo bien'], ['Sí (especificar)']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('📞 CONTACTO:\nIndica tu número de WhatsApp:', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('🖋️ DISEÑO:\nExplica tu idea de tatuaje:');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('📸 FOTO:\nEnvíame una referencia (o pulsa el botón si no tienes):', Markup.keyboard([['❌ Sin foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        stats.fichas++;
        await ctx.reply('🚀 Ficha técnica enviada correctamente.');
        
        const d = ctx.wizard.state.formData;
        const ficha = `🖋️ NUEVA FICHA\nNombre: ${d.nombre}\nEdad: ${d.edad}\nIdea: ${d.idea}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);

        return irAlMenuPrincipal(ctx);
    }
);

// --- 3. ESCENA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('✨ ZONA DEL CUERPO\n¿En qué zona estás pensando?',
            Markup.keyboard([['Rodilla', 'Codo', 'Cuello'], ['Brazo', 'Pierna', 'Espalda'], ['⬅️ Volver']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === '⬅️ Volver') return irAlMenuPrincipal(ctx);
        ctx.reply('🌟 Consejo: Busca diseños que fluyan con la anatomía de esa zona.');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// ==========================================
// LÓGICA DE NAVEGACIÓN
// ==========================================

function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('💎 SPICY INKK - MENÚ\n\nSelecciona una opción para probar el sistema. Cuando termines tu prueba, usa el botón de valoración.', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Tatuador', '⭐ Valoración Tester']
        ]).resize());
}

bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    if (userId === MI_ID || usuariosAutorizados.has(ctx.from.id)) {
        if (!usuariosAutorizados.has(ctx.from.id)) usuariosAutorizados.set(ctx.from.id, Date.now());
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO\n\nIntroduce tu clave de un solo uso para desbloquear el bot:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase().trim();
    if (userId.toString() === MI_ID || usuariosAutorizados.has(userId) || ctx.scene.current) return next();
    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); 
        ctx.reply('✅ Acceso concedido. Cronómetro iniciado.');
        return irAlMenuPrincipal(ctx);
    }
    return ctx.reply('❌ Clave inválida.');
});

// Middlewares
const stage = new Scenes.Stage([tattooScene, ideasScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

// --- ACCIONES DE BOTONES ---
bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));
bot.hears('⭐ Valoración Tester', (ctx) => ctx.scene.enter('feedback-scene'));

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('✨ PROTOCOLOS POST-TATTOO', Markup.inlineKeyboard([
        [Markup.button.callback('📖 Guía Lavado', 'lavado')],
        [Markup.button.callback('🚨 Emergencia', 'emergencia')]
    ]));
});

bot.hears('🎁 Sorteos', (ctx) => {
    ctx.reply('🔥 SORTEO ACTIVO\n\nFecha: Del 05 al 10 de febrero de 2026.\nLink participación:',
    Markup.inlineKeyboard([[Markup.button.url('🔗 Entrar al Sorteo', 'https://t.me/+bAbJXSaI4rE0YzM0')]]));
});

bot.hears('💬 Tatuador', (ctx) => {
    ctx.reply('📩 Contacto directo: @SpicyInkk'); 
});

bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('🗓️ Consulta las Stories de Instagram para ver huecos actuales.'));

bot.action('lavado', (ctx) => ctx.reply('Lavar 3 veces al día con jabón neutro y aplicar crema fina.'));
bot.action('emergencia', (ctx) => ctx.reply('Si notas infección, contacta urgente a @SpicyInkk.'));

bot.command('stats', (ctx) => {
    if(ctx.from.id.toString() === MI_ID) {
        ctx.reply(`📊 STATS\nTesters: ${usuariosAutorizados.size}\nClaves: ${CLAVES_DISPONIBLES.join(', ')}`);
    }
});

bot.launch().then(() => console.log('✅ SpicyBot Pro Operativo (+16 habilitado)'));
