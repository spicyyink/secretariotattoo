require('dotenv').config();

const { Telegraf, Scenes, session, Markup } = require('telegraf');
const http = require('http');

// ==========================================
// SERVIDOR DE SALUD
// ==========================================
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SpicyBot está online ✅');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ==========================================
// CONFIGURACIÓN DEL BOT Y SEGURIDAD
// ==========================================
const bot = new Telegraf(process.env.BOT_TOKEN);
const MI_ID = process.env.MI_ID;

// --- SISTEMA DE CLAVES DE UN SOLO USO (6 Claves Cortas) ---
let CLAVES_DISPONIBLES = ['s7p', 'k82', 'x9w', 'n4m', 'v2t', 'b5z'];
const usuariosAutorizados = new Map(); // Guardamos ID y el tiempo (ms) en que empezaron

let stats = { visitas: 0, fichas: 0 };

// --- ESCENA DE FEEDBACK (CRÍTICA) ---
const feedbackScene = new Scenes.WizardScene(
    'feedback-scene',
    (ctx) => {
        ctx.reply('🙏 ¡Datos guardados! ¿Quieres enviar tu valoración de tester ahora o prefieres seguir testeando?',
            Markup.keyboard([['📝 Enviar valoración ahora'], ['🔍 Seguir testeando']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text && ctx.message.text.includes('Seguir testeando')) {
            ctx.reply('¡Perfecto! Sigue revisando el bot. El cronómetro sigue contando.');
            irAlMenuPrincipal(ctx);
            return ctx.scene.leave();
        }
        ctx.reply('1/3 ¿Has encontrado algún fallo o error técnico?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.errores = ctx.message.text;
        ctx.reply('2/3 ¿Qué cambiarías o añadirías para mejorar la experiencia?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.mejoras = ctx.message.text;
        ctx.reply('3/3 Valoración general del 1 al 10:', 
            Markup.keyboard([['1','2','3','4','5'],['6','7','8','9','10']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const nota = ctx.message.text;
        const data = ctx.wizard.state;
        const inicio = usuariosAutorizados.get(ctx.from.id);
        const tiempoTotal = inicio ? Math.round((Date.now() - inicio) / 1000 / 60) : 0; 

        const reporte = `📊 **FEEDBACK TESTER**\n👤 User: @${ctx.from.username || 'Sin alias'}\n⏱️ Tiempo: ${tiempoTotal} min\n❌ Errores: ${data.errores}\n💡 Mejoras: ${data.mejoras}\n⭐ Nota: ${nota}`;
        
        await ctx.telegram.sendMessage(MI_ID, reporte);
        await ctx.reply(`✅ ¡Testeo enviado! Has dedicado ${tiempoTotal} min. Gracias por tu seriedad.`, Markup.removeKeyboard());
        return ctx.scene.leave();
    }
);

// --- ESCENA DE IDEAS ---
const ideasScene = new Scenes.WizardScene(
    'ideas-scene',
    (ctx) => {
        ctx.reply('¿En qué zona estás pensando?',
            Markup.keyboard([['Rodilla', 'Codo', 'Cuello'], ['Tríceps', 'Bíceps', 'Antebrazo'], ['⬅️ Volver']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        const zona = ctx.message.text ? ctx.message.text.toLowerCase() : '';
        if (zona.includes('volver')) return irAlMenuPrincipal(ctx);
        ctx.reply('🌟 Mi consejo: Para esa zona busca algo que fluya con tu anatomía.');
        setTimeout(() => irAlMenuPrincipal(ctx), 1500);
        return ctx.scene.leave();
    }
);

// --- ESCENA DE PRESUPUESTO (FORMULARIO) ---
const tattooScene = new Scenes.WizardScene(
    'tattoo-wizard',
    (ctx) => {
        ctx.reply('¡Hola! Soy SpicyBot, tu asistente personal.\n\n¿Cómo te llamas?');
        ctx.wizard.state.formData = { user: ctx.from.username ? `@${ctx.from.username}` : 'Sin alias' };
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.nombre = ctx.message.text;
        ctx.reply('¿Eres mayor de 18 años?', Markup.keyboard([['Sí, soy mayor', 'No']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        if (ctx.message.text === 'No') {
            ctx.reply('Lo siento, necesito que seas mayor de edad para tatuarte.');
            return ctx.scene.leave();
        }
        ctx.reply('¿Sufres de alergias o tomas alguna medicación?', 
            Markup.keyboard([['No, todo bien'], ['Sí (especificar)', 'No lo sé']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.salud = ctx.message.text;
        ctx.reply('¿Cuál es tu número de teléfono?', Markup.removeKeyboard());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.telefono = ctx.message.text;
        ctx.reply('¿Qué diseño tienes en mente?');
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.idea = ctx.message.text;
        ctx.reply('¿Qué tamaño aproximado quieres en cm?', 
            Markup.keyboard([['No lo sé, prefiero que me asesores']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.tamano = ctx.message.text;
        ctx.reply('¿Tienes cicatrices o lunares en esa zona?', 
            Markup.keyboard([['Piel limpia', 'Tengo cicatrices/lunares']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.piel = ctx.message.text;
        ctx.reply('¿Qué horario prefieres para tu cita?', 
            Markup.keyboard([['Mañanas', 'Tardes'], ['Cualquier horario']]).oneTime().resize());
        return ctx.wizard.next();
    },
    (ctx) => {
        ctx.wizard.state.formData.horario = ctx.message.text;
        ctx.reply('Envíame una foto de referencia o de la zona:', Markup.keyboard([['❌ No tengo foto']]).oneTime().resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        const d = ctx.wizard.state.formData;
        let photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;
        stats.fichas++;

        await ctx.reply('¡Ficha enviada! Ahora pasamos a tu valoración de tester.');

        const ficha = `🖋️ SOLICITUD TESTER\n👤 Nombre: ${d.nombre}\n🏥 Salud: ${d.salud}\n📞 WhatsApp: ${d.telefono}\n💡 Idea: ${d.idea}`;
        await ctx.telegram.sendMessage(MI_ID, ficha);
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);

        return ctx.scene.enter('feedback-scene'); 
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('🔥 MODO TESTER ACTIVO\nAnaliza todo con calma. El tiempo se está registrando.', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Hablar con el Tatuador']
        ]).oneTime().resize());
}

// --- LÓGICA DE ACCESO CORREGIDA (EXCEPCIÓN PARA TI) ---
bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    // Si eres tú O el usuario ya está autorizado, entra directo
    if (userId === MI_ID || usuariosAutorizados.has(ctx.from.id)) {
        if (!usuariosAutorizados.has(ctx.from.id)) usuariosAutorizados.set(ctx.from.id, Date.now());
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO.\nIntroduce una clave corta de tester para continuar:');
});

bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase().trim();

    // Dejar pasar si eres tú, si ya estás autorizado o si estás dentro de una escena
    if (userId.toString() === MI_ID || usuariosAutorizados.has(userId) || ctx.scene.current) {
        return next();
    }

    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.set(userId, Date.now()); 
        ctx.reply('✅ Clave aceptada. ¡Bienvenido al test!');
        return irAlMenuPrincipal(ctx);
    }

    return ctx.reply('❌ Clave incorrecta. Introduce una clave válida para testear.');
});

// --- LÓGICA DE BOTONES ---
const stage = new Scenes.Stage([tattooScene, ideasScene, feedbackScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('🧼 Cuidados', (ctx) => {
    ctx.reply('✨ **GUÍA DE CUIDADOS** ✨', Markup.inlineKeyboard([
        [Markup.button.callback('📖 Ver Guía de Lavado', 'guia_lavado')],
        [Markup.button.callback('❓ Preguntas Frecuentes', 'faq')],
        [Markup.button.callback('🚨 EMERGENCIA', 'emergencia')]
    ]));
});

bot.hears('💬 Hablar con el Tatuador', (ctx) => {
    ctx.reply('Contacto directo:', 
    Markup.inlineKeyboard([[Markup.button.url('📩 Contacto Directo', 'https://t.me/SpicyInkk')]])); 
});

bot.command('stats', (ctx) => {
    if(ctx.from.id.toString() === MI_ID) {
        ctx.reply(`📊 STATS TEST:\n- Visitas: ${stats.visitas}\n- Fichas: ${stats.fichas}\n- Testers activos: ${usuariosAutorizados.size}\n- Claves libres: ${CLAVES_DISPONIBLES.join(', ')}`);
    }
});

bot.action('guia_lavado', (ctx) => ctx.reply('1. Lava 3 veces al día.\n2. Seca con papel.\n3. Aplica Aquaphor.'));
bot.action('faq', (ctx) => ctx.reply('• Mínimo: 60€\n• Edad: +18'));
bot.action('emergencia', (ctx) => ctx.reply('🚨 Si notas infección, avisa al tatuador.'));

bot.hears('🎁 Sorteos', (ctx) => ctx.reply('Sorteo activo en Telegram.'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('Revisa Stories de Instagram.'));

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Operativo - Modo Tester con Cronómetro'));
bot.catch((err) => console.error(err));
