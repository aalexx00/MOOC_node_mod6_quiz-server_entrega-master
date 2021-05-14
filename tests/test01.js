const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process')
const Browser = require('zombie');

const chai = require('chai');
const expect = chai.expect;
const should = chai.should()
const chaiHttp = require('chai-http');


const URL = 'http://localhost:8000'
Browser.localhost('http://localhost/', 8000);

const { Sequelize } = require('sequelize');
const sequelize = new Sequelize("sqlite:db.sqlite", { logging: false, operatorsAliases: false });

const User = sequelize.define(
    'user', {
    name: Sequelize.STRING
})

const Quiz = sequelize.define(
    'quiz', {
    question: Sequelize.STRING,
    answer: Sequelize.STRING
})


const path_root = path.resolve(process.cwd());
const path_server = path.join(path_root, "main.js");

const path_dbsqlite = path.resolve(path.join(path_root, "db.sqlite"));
const path_dbsqliteBak = (path_dbsqlite +'.bak');

const browser = new Browser({ waitDuration: '50000', silent: true });
chai.use(chaiHttp);

let server = null;

async function getId() {
    return await Quiz.findOne({})
}

//Comprobaciones
describe('Inicio Tests ....', function () {
    this.timeout(1000);

    it(`Comprobando db.sqlite y realizando BK en ${path_dbsqliteBak}` , function () {
        //Podemos trabajar con la copia, pero lo hacemos con la original
        fs.access(path_dbsqlite, (err) => {
            if (err) {
                this.skip()
            } else {
                fs.copyFileSync(path_dbsqlite, path_dbsqliteBak);
                expect(err).to.be.null;
            }
        })
    });

    it('Inicializando el servidor...', function (done) {
        server = spawn("node", [path_server], { detached: true });
        setTimeout(function () {
            sequelize.sync(); //ponemos en marcha la BD
            done();
        }, 300) 
    });


    describe('Test 1, Un test que compruebe la funcionalidad de una vista mostrada al usuario.', function () {
        
        it("La página debe tener un encabezado", function(done){
            browser.visit(URL, function () {
                browser.assert.element('head');
                done();
            });
        });

        it("Comprobar '/Quizzes'", function (done) {
            browser.visit(URL, function () {
                browser.assert.status(200);
                browser.assert.text('title', "Quiz");
                done();
            });
        });

        it("Comprobar '/Quizzes/1/play'", function (done) {
            browser.visit(`${URL}/quizzes/1/play`, function () {
                browser.assert.status(200);
                browser.assert.text('h1', "Play Quiz");
                done();
            });
        });
       
        it("Comprobar '/Quizzes/1/check'", function (done) {
            browser.visit(`${URL}/quizzes/1/check?response=Rome`, function () {
                browser.assert.status(200);
                browser.assert.text('h1', "Result");
                done()
            });
        })

    })

    describe('Test 2, Un test que compruebe el funcionamiento de un formulario', function () {

        before("Probando Edit 1 '/quizzes/1/edit'.", function (done) {
            browser.visit('http://localhost:8000/quizzes/1/edit', function () {
                browser.assert.success();
                done();
            })
        })

        it("Rellenando formulario '/quizzes/1/edit'.", function () {
            browser.assert.text('title', 'Quiz');
            browser.fill('input[name="question"]', 'Capital of Spain');
            browser.fill('input[name="answer"]', 'Madrid');
            browser.pressButton("Edit", function () {
                browser.wait().then(() => {
                    browser.assert.success();
                });
            });
        })
    })

    describe("Test 3, Un test que compruebe el funcionamiento de una ruta", function () {

        it("Check", async function () {
            const response = await chai.request(URL).get('/quizzes/1/check');
            expect(response).to.have.status(200);
        })
        it("Play", async function () {
            const response = await chai.request(URL).get('/quizzes/1/play');
            expect(response).to.have.status(200);
        })
        it("Edit", async function () {
            const response = await chai.request(URL).get('/quizzes/1/edit');
            expect(response).to.have.status(200);
        })
        it("New", async function () {
            const response = await chai.request(URL).get('/quizzes/new');
            expect(response).to.have.status(200);
        })
    })

    describe('Test 4, Un test que compruebe el funcionamiento de un controlador', function () {
        ///Se puede crear vacio, deberia de dar error
        it('Controlador POST a "/Quizzes"', function (done) {
            chai.request(URL)
                .post('/quizzes')
                .set({ 'content-type': 'application/x-www-form-urlencoded' })
                .send({ question: 'POST?', answer: 'Yes' })
                .end(function (err, res) {
                    expect(res).to.have.status(200);
                    done();
                });
        });
        it('Realizando peticion PUT a "/Quizzes/1"', function (done) {
            chai.request(URL)
                .put('/quizzes/2')
                .set({ 'content-type': 'application/x-www-form-urlencoded' })
                .send({ question: 'Update?', answer: 'Yes' })
                .end(function (err, res) {
                    expect(res).to.have.status(200);
                    done();
                });
        });

    })

    describe('Test 5, Un test que compruebe el funcionamiento de un acceso a la BD', function () {

        it('Obteniendo cantidad de datos de la BBDD.', async function () {
            let count = await Quiz.count();
            expect(count).to.equal(6);
        })
        it('Update quiz', async function () {

            await Quiz.create({ question: 'NEW', answer: 'Test' });
            let quiz = await Quiz.findOne({ where: { question: 'NEW' } });

            expect(quiz).to.be.an('Object');
            quiz.should.have.property('question').to.equal('NEW');
            quiz.should.have.property('answer');
            quiz.should.have.property('id');
        })
        it('Probando User', async function () {

            await User.create({ name: 'UserTest' });
            let user = await User.findOne({ where: { name: 'UserTest' } });
            // console.log(user)
            expect(user).to.be.an('Object');
            user.should.have.property('name').to.equal('UserTest');
   
        })
    })

    after('Desconectado servidor', function () {
        if (server) {
            //Apagamos servidor
            server.kill();
            //Desconectamos DB
            let queryInterface = sequelize.getQueryInterface();
            queryInterface.sequelize.connectionManager.connections.default.close(); // manually close the sqlite connection which sequelize.close() omits
            sequelize.close();
            //Damos tiempo a que se desconecte la BD antes de restablecerla.
            //Si no se hace de esta manera, da error en el fichero.
            setTimeout(function () {
                fs.unlinkSync(path_dbsqlite);          
                fs.access(path_dbsqliteBak, (err) => {
                    if (!err) {
                        fs.renameSync(path_dbsqliteBak, path_dbsqlite)
                    }
                });   
            }, 2000);//2000 Mas que suficiente
        }
    });

});
    // const browser = new Browser();

    // before(()=> browser.visit("http://localhost:8000"));

    // it ('Test 1, Un test que compruebe la funcionalidad de una vista mostrada al usuario', function(){
    //     browser.assert.success();
    // });

    // it ('Test 2, Un test que compruebe el funcionamiento de un formulario', function(){
    //     browser.assert.success();
    // });

    // it ('Test 3, Un test que compruebe el funcionamiento de una ruta', function(){
    //     browser.assert.url({pathname:"/quizzes/new"});
    // });  

    // it ('Test 4, Un test que compruebe el funcionamiento de un controlador', function(){
    //     browser.assert.success();
    // });  

    // it ('Test 5, Un test que compruebe el funcionamiento de un acceso a la BD', function(){
    //     browser.assert.success();
    // });      

