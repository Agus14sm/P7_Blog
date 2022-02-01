/* eslint-disable no-invalid-this*/
/* eslint-disable no-undef*/
const path = require("path");
const {log,checkFileExists,create_browser,from_env,ROOT,path_assignment, warn_errors, scored, checkFilExists} = require("./testutils");
const fs = require("fs");
const net = require('net');
const spawn = require("child_process").spawn;
const util = require('util');
const exec = util.promisify(require("child_process").exec);


const PATH_ASSIGNMENT = path_assignment("blog");


const URL = `file://${path.resolve(path.join(PATH_ASSIGNMENT.replace("%", "%25"), "cv.html"))}`;
// Should the server log be included in the logs?
const LOG_SERVER = from_env("LOG_SERVER") !== "undefined";
const TIMEOUT =  parseInt(from_env("TIMEOUT", 2000));
const TEST_PORT =  parseInt(from_env("TEST_PORT", "3001"));


let browser = create_browser();


describe("Tests Práctica 2", function() {
    after(function () {
        warn_errors();
    });

    describe("Prechecks", function () {
	      scored(`Comprobando que existe la carpeta de la entrega: ${PATH_ASSIGNMENT}`,
               -1,
               async function () {
                   this.msg_err = `No se encontró la carpeta '${PATH_ASSIGNMENT}'`;
                   (await checkFileExists(PATH_ASSIGNMENT)).should.be.equal(true);
	             });

        scored(`Comprobar que se han añadido plantillas express-partials`, -1, async function () {
            this.msg_ok = 'Se incluye layout.ejs';
            this.msg_err = 'No se ha encontrado views/layout.ejs';
            fs.existsSync(path.join(PATH_ASSIGNMENT, "views", "layout.ejs")).should.be.equal(true);
        });

        scored(`Comprobar que la migración y el seeder existen`, -1, async function () {
            this.msg_ok = 'Se incluye la migración y el seeder';
            this.msg_err = "No se incluye la migración o el seeder";

            let mig = fs.readdirSync(path.join(PATH_ASSIGNMENT, "migrations")).filter(fn => fn.endsWith('-CreatePostsTable.js'));
            this.msg_err = `No se ha encontrado la migración`;
            (mig.length).should.be.equal(1);
            let seed = fs.readdirSync(path.join(PATH_ASSIGNMENT, "seeders")).filter(fn => fn.endsWith('-FillPostsTable.js'));
            this.msg_err = 'No se ha encontrado el seeder';
            (seed.length).should.be.equal(1);
            // We could use a regex here to check the date
        });

        scored(`Comprobar que los controladores existen`, -1, async function () {
            this.msg_ok = 'Se incluye el controlador de post';
            this.msg_err = "No se incluye el controlador de post";
            post = require(path.resolve(path.join(PATH_ASSIGNMENT, 'controllers', 'post')));
            post.index.should.not.be.undefined;
        })

        scored(`Comprobar que se ha añadido el código para incluir los comandos adecuados`, -1, async function () {
            let rawdata = fs.readFileSync(path.join(PATH_ASSIGNMENT, 'package.json'));
            let pack = JSON.parse(rawdata);
            this.msg_ok = 'Se incluyen todos los scripts/comandos';
            this.msg_err = 'No se han encontrado todos los scripts';
            scripts = {
                "super": "supervisor ./bin/www",
                "migrate": "sequelize db:migrate --url sqlite://$(pwd)/blog.sqlite",  
                "seed": "sequelize db:seed:all --url sqlite://$(pwd)/blog.sqlite",  
                "migrate_win": "sequelize db:migrate --url sqlite://%cd%/blog.sqlite",  
                "seed_win": "sequelize db:seed:all --url sqlite://%cd%/blog.sqlite"  ,
            }
            for(script in scripts){
                this.msg_err = `Falta el comando para ${script}`;
                pack.scripts[script].should.be.equal(scripts[script]);
            }
        })

        scored(`Comprobar que las plantillas express-partials tienen los componentes adecuados`, 1, async function () {
            this.msg_ok = 'Se incluyen todos los elementos necesarios en la plantilla';
            this.msg_err = 'No se ha encontrado todos los elementos necesarios';
            let checks = {
                "layout.ejs": {
                    true: [/<%- body %>/g, /<header/, /<\/header>/, /<nav/, /<\/nav/, /<footer/, /<\/footer>/]
                },
                "index.ejs": {
                    true: [/<h1/, /<\/h1>/],
                    false: [/<header>/, /<\/header>/, /<nav/, /<\/nav>/, /<footer/, /<\/footer>/]
                },
                [path.join("posts", "index.ejs")]: {
                    true: [/<article/, /<\/article>/, /Show/, /Edit/],
                }
            }

            for (fpath in checks) {
                let templ = fs.readFileSync(path.join(PATH_ASSIGNMENT, "views", fpath), "utf8");
                for(status in checks[fpath]) {
                    elements = checks[fpath][status];
                    for(var elem in elements){
                        let e = elements[elem];
                        if (status) {
                            this.msg_err = `${fpath} no incluye ${e}`;
                        } else {
                            this.msg_err = `${fpath} incluye ${e}, pero debería haberse borrado`;
                        }
                        e.test(templ).should.be.equal((status == 'true'));
                    }
                }
            }
        });

    });

    describe("Tests funcionales", function () {
        var server;
        const db_file = path.resolve(path.join(ROOT, 'post.sqlite'));

        before(async function() {
            // Crear base de datos nueva y poblarla antes de los tests funcionales. por defecto, el servidor coge post.sqlite del CWD
            fs.closeSync(fs.openSync(db_file, 'w'));

            let sequelize_cmd = path.join(PATH_ASSIGNMENT, "node_modules", ".bin", "sequelize")
            let db_url = `sqlite://${db_file}`;

            await exec(`${sequelize_cmd} db:migrate --url "${db_url}" --migrations-path ${path.join(PATH_ASSIGNMENT, "migrations")}`)
            log('Lanzada la migración');
            await exec(`${sequelize_cmd} db:seed:all --url "${db_url}" --seeders-path ${path.join(PATH_ASSIGNMENT, "seeders")}`)
            log('Lanzado el seeder');


            let bin_path = path.join(PATH_ASSIGNMENT, "bin", "www");
            server = spawn('node', [bin_path], {env: {PORT: TEST_PORT, DATABASE_URL: db_url}});
            server.stdout.setEncoding('utf-8');
            server.stdout.on('data', function(data) {
                log('Salida del servidor: ', data);
            })
            log(`Lanzado el servidor en el puerto ${TEST_PORT}`);
            await new Promise(resolve => setTimeout(resolve, TIMEOUT));
            browser.site = `http://localhost:${TEST_PORT}/`;
            try{
                await browser.visit("/");
                browser.assert.status(200);
            }catch(e){
                console.log("No se ha podido contactar con el servidor.");
                throw(e);
            }
        });

        after(async function() {
            // Borrar base de datos
            await server.kill();
            fs.unlinkSync(db_file);
        })

        var endpoints = [
            ["/", 200],
            ["/posts", 200],
            ["/author", 200],
            ["/users", 404],
            // Estas dos se comprueban en tests independientes
            // ["/posts/new", 200],
            // ["/posts/1/edit", 200],
        ];

        for (idx in endpoints) {
            let endpoint = endpoints[idx][0]
            let code = endpoints[idx][1]
            let num = 8 + parseInt(idx);
            scored(`Comprobar que se resuelve una petición a ${endpoint} con código ${code}`,
                   0.25, async function () {
                this.msg_ok = 'Respuesta correcta';
                this.msg_err = 'No hubo respuesta';
                check = function(){
                    browser.assert.status(code);
                }
                return browser.visit(endpoint)
                    .then(check)
                    .catch(check);
            })
        }

        scored(`Comprobar que se muestran los posts`,
               2, async function () {
            this.msg_err = 'No se muestra la página con los posts';
            let posts = [
                {id: 1, title: "Sobre esta Práctica", body: "El objetivo de esta práctica es crear el esqueleto común, incorporar la página del CV, y el recurso Post con adjunto."},
            ]

            await browser.visit("/posts");
            browser.assert.status(200)

            res = browser.html();

            for (idx in posts) {
                let post = posts[idx];
                this.msg_err = `No se encuentra el post "${posts.title}" en los posts`;
                res.includes(post.title).should.be.equal(true);
                await browser.visit("/posts/" + post.id);
                this.msg_err = `La página del post "${post.title}" (/posts/${post.id}) no incluye el cuerpo correctamente`;
                browser.html().includes(post.body).should.be.equal(true);
            }
        })

        scored(`Comprobar que se pueden editar los posts`,
               3, async function () {
                   this.msg_err = 'No se muestra la página con los posts';
                   let posts = [
                       {id: 1, title: "Sobre esta Práctica", body: "El objetivo de esta práctica es crear el esqueleto común, incorporar la página del CV, y el recurso Post con adjunto."},
                   ]

                   await browser.visit("/posts");
                   browser.assert.status(200)

                   res = browser.html();

                   for (idx in posts) {
                       let post = posts[idx];
                       this.msg_err = `No se encuentra el post "${posts.title}" en los posts`;
                       res.includes(post.title).should.be.equal(true);
                       await browser.visit(`/posts/${post.id}/edit`);
                       this.msg_err = `La página del post "${post.title}" (/posts/${post.id}) no parece permitir editar correctamente`;
                       browser.html().includes(post.body).should.be.equal(true);
                   }
               })
        scored(`Comprobar que se pueden borrar los posts`,
               3, async function () {
                   this.msg_err = 'No se muestra la página con los posts';
                   let posts = [
                       {id: 1, title: "Sobre esta Práctica", body: "El objetivo de esta práctica es crear el esqueleto común, incorporar la página del CV, y el recurso Post con adjunto."},
                   ]


                   var total = posts.length;

                   await browser.visit("/posts");
                   browser.assert.status(200)
                   res = browser.html();
                   res.includes(posts[0].title).should.be.equal(true);

                   for (idx in posts) {

                       let post = posts[idx];
                       this.msg_err = `No se encuentra el post "${posts.title}" en los posts`;

                       res.includes(post.title).should.be.equal(true);

                       this.msg_err = `La página del post "${post.title}" (/posts/${post.id}) no parece permitir borrar correctamente`;
                       await browser.visit(`/posts/${post.id}?_method=DELETE`);

                       this.msg_err = `La página de posts sigue mostrando "${post.title}" (/posts/${post.id}) después de haber sido borrado`;
                       await browser.visit("/posts");
                       browser.assert.status(200)
                       res = browser.html();
                       res.includes(post.title).should.be.equal(false);
                   }
               })


    });

})
