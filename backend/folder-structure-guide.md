# Folder Structure guide

> This doc is a guide for providing information on the folder structure.

All the application related code is present inside the `/src` folder.

Under `src` folder we have this predefined folders

- [Folder Structure guide](#folder-structure-guide)
  - [configs folder](#configs-folder)
  - [db folder](#db-folder)
    - [migrations folder](#migrations-folder)
    - [models folder](#models-folder)
    - [seeders folder](#seeders-folder)
  - [errors folder](#errors-folder)
  - [helpers folder](#helpers-folder)
  - [json-schemas folder](#json-schemas-folder)
  - [libs folder](#libs-folder)
  - [rest-resources folder](#rest-resources-folder)
    - [controllers](#controllers)
    - [middlewares](#middlewares)
    - [routes](#routes)
  - [services folder](#services-folder)
  - [socket-resources folder](#socket-resources-folder)
    - [emitters](#emitters)
    - [handlers](#handlers)
    - [middlewares](#middlewares-1)
    - [namespaces](#namespaces)
  - [utils folder](#utils-folder)
  - [templates folder](#templates-folder)

All this folder is pre created and contain code as their name suggests

## configs folder

This folder contains all the config of the projects.

Make sure file name ends with `*.config.js`

---

## db folder

This folder contains all files related to the db migration, models, and seeders under their respective folders.

  ### migrations folder

  This folder contains all the migration of the application.

  ### models folder

  This folder contains all the models of the application.

  ### seeders folder

  This folder contains all the seeders of the application.

---

## errors folder

This folder contains all the error files of the application.

You can define all the error here you just need to extend your error via base error and you are good to go.
Make sure file name ends with `*.error.js` also the Error name should be ends with DemoError also in one file
there should be only one error

Please define error type in utils under `constants/errors.js` and when use in `service` please enter proper key name like this

```
this.addError('RequestInputValidationErrorType', 'Error description')
```

---

## helpers folder

This folder contains all the helpers files of the application.

Make sure file name ends with `*.helpers.js`

---

## json-schemas folder

This folder contains all base resources of the schema.

Make sure file name ends with `*.schema.js`

---

## libs folder

This folder contains all lib files like logger, redisClient, socketClient everything which is module has come here.

after creating object gets exported from it.

---

## rest-resources folder

This folder contains files and folders related to the rest resources, we are using express js as framework here inside `index.js`.

  ### controllers

  All the controllers of the application will go here.
  File name should ends with `*.controller.js` also class name should be ends with `DemoController`
  There should be only one controller per file and it should contain static methods as a route handler
  Please refer demo.controller.js inside controllers

  ### middlewares

  All the rest middlewares of the application will go here.
  There are some default middlewares which is the back a bone of this structure
  File name should ends with `*.middleware.js` also middleware name should be ends with `demoMiddleware`

  i.e. ContextMiddleware, RequestValidationMiddleware, ResponseValidationMiddleware

  RequestValidationMiddleware and ResponseValidationMiddleware go just before the after the main route handler

  please see the jsdoc under the middlewares for how to use these middlewares and refer demo route.

  ### routes

  All the routes of the application will go here.

  File name should ends with `*.routes.js` also route name should be ends with `demoRoutes`

---

## services folder

All the business logic of the application will go inside the services.

Every service will extends the ServiceBase.js each service should be a class with async run() method

File name should ends with `*.service.js` also services name should be ends with `DemoService`.

Please refer getDemo.service.js and ServiceBase.js

---

## socket-resources folder

This folder contains files and folders related to the socket resources, we are using socket.io as framework here inside `index.js`.

  ### emitters

  All the emitters of the application will go here.

  File name should ends with `*.emitter.js` also emitters name should be ends with `DemoEmitter`.
  There should be only one emitter per file and it should contain static methods as a emitter

  Please refer demo.emitter.js

  ### handlers

  All the socket message with handlers of the application will go here.

  File name should ends with `*.handler.js` also handlers name should be ends with `DemoHandler`.
  There should be only one handler per file and it should contain static methods as a message/event handler

  Please refer demo.handler.js

  ### middlewares

  All the socket middlewares of the application will go here.

  There are some default middlewares which is the back a bone of this structure
  File name should ends with `*.middleware.js` also middleware name should be ends with `DemoMiddleware`

  i.e. ContextSocketMiddleware, RequestValidationSocketMiddleware, ResponseValidationSocketMiddleware

  ContextSocketMiddleware will automatically apply ResponseValidationSocketMiddleware so you just need apply ContextSocketMiddleware,
  RequestValidationSocketMiddleware both the middleware is socket level middleware.

  please see the jsdoc under the middlewares for how to use these middlewares and refer demo namespace.

  ### namespaces

  All the socket namespace of the application will go here.

  File name should ends with `*.namespace.js` also namespace name should be ends with `DemoNamespace`

  Please refer demo.namespace.js.

---

## utils folder

All Application utils are written down here.

File name should ends with `*.utils.js`

---

## templates folder

All Application templates will go here.

File name should ends with `*.template.js` and it should export the function name `createDemoTemplate`
