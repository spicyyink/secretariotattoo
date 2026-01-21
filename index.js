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

// --- SISTEMA DE CLAVES DE UN SOLO USO (Ahora 6 claves) ---
let CLAVES_DISPONIBLES = [
    'test.spicy.01', 
    'test-spicy-02', 
    'spicy.test.03', 
    'spicy-test-04', 
    'spicy.test-05',
    'test-spicy.06'
];
const usuariosAutorizados = new Set(); // Guarda los IDs de quienes ya pusieron la clave

let stats = { visitas: 0, fichas: 0 };

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

        await ctx.reply('¡Ficha enviada! El tatuador revisará tu caso y te contactará pronto.', Markup.removeKeyboard());

        const ficha = `🖋️ NUEVA SOLICITUD PARA EL TATUADOR\n\n👤 Nombre: ${d.nombre}\n🔗 Telegram: ${d.user}\n🏥 Salud: ${d.salud}\n📞 WhatsApp: ${d.telefono}\n💡 Idea: ${d.idea}\n📏 Tamaño: ${d.tamano}\n🩹 Piel: ${d.piel}\n🕒 Horario: ${d.horario}`;
        
        await ctx.telegram.sendMessage(MI_ID, ficha, {
            ...Markup.inlineKeyboard([[Markup.button.url('💬 Abrir WhatsApp', `https://wa.me/${d.telefono.replace(/\D/g, '')}`)]])
        });
        if (photoId) await ctx.telegram.sendPhoto(MI_ID, photoId);
        setTimeout(() => irAlMenuPrincipal(ctx), 2000);
        return ctx.scene.leave();
    }
);

// --- MENÚ PRINCIPAL ---
function irAlMenuPrincipal(ctx) {
    stats.visitas++;
    return ctx.reply('Bienvenido a Spicy Inkk 🖋️ (MODO TEST)\n¿En qué puedo ayudarte?', 
        Markup.keyboard([
            ['🔥 Hablar con SpicyBot'],
            ['💡 Consultar Ideas', '🧼 Cuidados'],
            ['🎁 Sorteos', '📅 Huecos Libres'],
            ['💬 Hablar con el Tatuador']
        ]).oneTime().resize());
}

// --- LÓGICA DE ACCESO (START) ---
bot.start((ctx) => {
    if (usuariosAutorizados.has(ctx.from.id)) {
        return irAlMenuPrincipal(ctx);
    }
    ctx.reply('🔒 ACCESO RESTRINGIDO.\nIntroduce una clave de tester de un solo uso para continuar:');
});

// --- MIDDLEWARE DE FILTRO DE MENSAJES ---
bot.on('text', (ctx, next) => {
    const userId = ctx.from.id;
    const texto = ctx.message.text.toLowerCase();

    if (usuariosAutorizados.has(userId)) {
        return next();
    }

    if (CLAVES_DISPONIBLES.includes(texto)) {
        CLAVES_DISPONIBLES = CLAVES_DISPONIBLES.filter(c => c !== texto);
        usuariosAutorizados.add(userId);
        ctx.reply('✅ Clave aceptada. Esta clave ha quedado desactivada para otros usuarios.');
        return irAlMenuPrincipal(ctx);
    }

    return ctx.reply('❌ Clave incorrecta o ya utilizada. Introduce una clave válida para testear.');
});

// --- LÓGICA DE BOTONES ---
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
        ctx.reply(`📊 STATS TEST:\n- Visitas: ${stats.visitas}\n- Fichas: ${stats.fichas}\n- Claves restantes: ${CLAVES_DISPONIBLES.length}\n- Claves disponibles: ${CLAVES_DISPONIBLES.join(', ')}`);
    }
});

bot.action('guia_lavado', (ctx) => ctx.reply('1. Lava 3 veces al día.\n2. Seca con papel.\n3. Aplica Aquaphor.'));
bot.action('faq', (ctx) => ctx.reply('• Mínimo: 60€\n• Edad: +18'));
bot.action('emergencia', (ctx) => ctx.reply('🚨 Si notas infección, avisa al tatuador.'));

bot.hears('🎁 Sorteos', (ctx) => ctx.reply('Sorteo activo en Telegram.'));
bot.hears('📅 Huecos Libres', (ctx) => ctx.reply('Revisa Stories de Instagram.'));

const stage = new Scenes.Stage([tattooScene, ideasScene]);
bot.use(session());
bot.use(stage.middleware());

bot.hears('🔥 Hablar con SpicyBot', (ctx) => ctx.scene.enter('tattoo-wizard'));
bot.hears('💡 Consultar Ideas', (ctx) => ctx.scene.enter('ideas-scene'));

bot.launch().then(() => console.log('✅ SpicyBot Protegido (Single-use) Operativo'));
bot.catch((err) => console.error(err));
