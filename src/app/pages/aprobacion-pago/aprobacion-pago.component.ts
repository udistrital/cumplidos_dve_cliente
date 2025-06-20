import { Component, OnInit } from '@angular/core';
import { LocalDataSource } from 'ng2-smart-table';
import { Respuesta } from 'src/app/@core/models/respuesta';
import { TablaPeticiones } from 'src/app/@core/models/tabla_peticiones';
import { environment } from 'src/environments/environment';
import { RequestManager } from '../services/requestManager';
import { UserService } from '../services/userService';
import { UtilService } from '../services/utilService';
import { ModalDocumentViewerComponent } from '../modal-document-viewer/modal-document-viewer.component';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { FixDataService } from 'src/app/@core/services/fix_data.service';
import { SmartTableService } from 'src/app/@core/services/smart_table_service';

@Component({
  selector: 'app-aprobacion-pago',
  templateUrl: './aprobacion-pago.component.html',
  styleUrls: ['./aprobacion-pago.component.scss']
})
export class AprobacionPagoComponent implements OnInit {

  //SETTINGS
  PeticionesOrdenadorSettings: any;
  dialogConfig: MatDialogConfig;
  DeshabilitarBoton = false;


  //DATA
  PeticionesOrdenadorData: LocalDataSource;
  NombreOrdenador = '';
  DocumentoOrdenador = '';
  CumplidosSelected: any = [];
  Meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
  MesSeleccionado: any = null;
  Anos = [(new Date().getFullYear())];
  AnoSeleccionado: any = null;
  Periodos = [];
  PeriodoSeleccionado: any = null;

  constructor(
    private request: RequestManager,
    private dialog: MatDialog,
    private popUp: UtilService,
    private userService: UserService,
    private fixDataService: FixDataService,
    private smartTableService: SmartTableService
  ) {
    this.initTable();
    this.GenerarPeriodos();
  }

  async ngOnInit(): Promise<void> {
    this.popUp.loading();
    await this.consultarNumeroDocumento();
    await this.consultarOrdenador();
    await this.consultarPeticiones();
    this.dialogConfig = new MatDialogConfig();
    this.dialogConfig.width = '1200px';
    this.dialogConfig.height = '800px';
    this.dialogConfig.data = {};
  }

  initTable(): void {

    TablaPeticiones['Dependencia'] =
    {
      ...TablaPeticiones['Dependencia'],
      ...this.smartTableService.getProyectoCurricularConf()
    }

    TablaPeticiones['PagoMensual'] =
    {
      ...TablaPeticiones['PagoMensual'],
      ...this.smartTableService.getDocumentoConf()
    }

    TablaPeticiones['NombrePersona'] =
    {
      ...TablaPeticiones['NombrePersona'],
      ...this.smartTableService.getNombreConf()
    }

    TablaPeticiones['NumeroContrato'] =
    {
      ...TablaPeticiones['NumeroContrato'],
      ...this.smartTableService.getNumeroContratoConf()
    }

    TablaPeticiones['Mes'] =
    {
      ...TablaPeticiones['Mes'],
      ...this.smartTableService.getMesSolicitudConf()
    }

    TablaPeticiones['Ano'] =
    {
      ...TablaPeticiones['Ano'],
      ...this.smartTableService.getAnioSolicitudConf()
    }

    this.PeticionesOrdenadorSettings = {
      selectMode: 'multi',
      columns: TablaPeticiones,
      mode: 'external',
      actions: {
        add: false,
        edit: false,
        delete: false,
        position: 'right',
        columnTitle: 'Acciones',
        custom: [
          {
            name: 'Aprobar',
            title: '<em title="Aprobar"><button mat-button type="button"><i class="fas fa-check"></i>    </button></em>'
          },
          {
            name: 'Rechazar',
            title: '<em title="Rechazar" class="rechazar"><button mat-button type="button">    <i class="fas fa-times"></i></button></em>'
          }
        ],
      },
      selectedRowIndex: -1,
      noDataMessage: 'No hay peticiones a revisar',
      pager: {
        display: true,
        perPage: 10,
      }
    };
  }

  GenerarPeriodos(): void {
    var AnoActual = new Date().getFullYear();
    var AnoProximo = new Date().getFullYear() + 1;
    this.Periodos[AnoActual] = [AnoActual + "-3", AnoActual + "-2", AnoActual + "-1"]
    this.Periodos[AnoProximo] = [AnoProximo + "-3", AnoProximo + "-2", AnoProximo + "-1"]
  }

  async consultarNumeroDocumento() {
    return new Promise((resolve) => {
      this.userService.user$.subscribe((data: any) => {
        if (data && data.userService && data.userService.documento) {
          this.DocumentoOrdenador = data.userService.documento;
          resolve(undefined);
        }
        else {
          this.popUp.error('No se ha podido consultar documento del Ordenador del gasto.')
        }
      });
    });
  }

  async consultarOrdenador() {
    return new Promise((resolve, reject) => {
      this.request.get(environment.ADMINISTRATIVA_AMAZON_SERVICE, `ordenadores?query=Documento:${this.DocumentoOrdenador}&limit=0`).subscribe({
        next: (response: any) => {
          if (response && response.length > 0) {
            this.NombreOrdenador = response[0].NombreOrdenador;
            resolve(undefined);
          }
          else{
            this.popUp.error('No se ha podido obtener el Ordenador del gasto')
          }
        },
        error: () => {
          reject(
            this.popUp.error('Error en peticion al consultar Ordenador del gasto')
          )
        }
      });
    });
  }

  async consultarPeticiones() {
    return new Promise((resolve, reject) => {
      this.request.get(environment.CUMPLIDOS_DVE_MID_SERVICE, `aprobacion_pago/solicitudes_ordenador/${this.DocumentoOrdenador}`).subscribe({
        next: (response: Respuesta) => {
          if (response.Success) {
            if (response.Data === null || (response.Data as any).length === 0) {
              this.popUp.warning("No se encontraron peticiones para el Ordenador del Gasto.");
            } else {
              this.fixDataService.setDatos(response.Data);
              let fixedData = this.fixDataService.getDatos();
              this.PeticionesOrdenadorData = new LocalDataSource(fixedData);
              this.SuscribeEventosData();
              this.popUp.close();
            }
            resolve(undefined);
          }
        },
        error: (error: any) => {
          reject(
            this.popUp.error("Error obteniendo peticiones del Ordenador del gasto")
          )
        }
      });
    });
  }

  //SUSCRIPCION A LOS EVENTOS DE LOS DATOS DE LA TABLA
  SuscribeEventosData() {
    this.PeticionesOrdenadorData.onChanged().subscribe(change => {
      switch (change.action) {
        case 'page':
          this.CumplidosSelected = [];
        case 'filter':
          this.CumplidosSelected = [];
        case 'sort':
          this.CumplidosSelected = [];
      }
    });
  }

  GenerarCertificado(): void {
    if (this.MesSeleccionado === null || this.AnoSeleccionado === null || this.PeriodoSeleccionado === null) {
      this.popUp.warning("Se deben de seleccionar todos los campos para generar el certificado.")
    } else {
      var facultad_homologada = null;
      var dependencia = null;

      this.popUp.loading();

      this.request.get(environment.CUMPLIDOS_DVE_MID_SERVICE, `aprobacion_pago/dependencia_ordenador/${this.DocumentoOrdenador}`).subscribe({
        next: (response: Respuesta) => {
          if (response.Success) {
            facultad_homologada = response.Data;
            this.request.get(environment.OIKOS_SERVICE, `dependencia/${facultad_homologada}`).subscribe({
              next: (response: any) => {
                dependencia = response.Nombre;
                //QUITAR LOS PARENTESIS DE LA URL
                this.NombreOrdenador = this.NombreOrdenador.replace(/\(|\)/g, '');
                this.request.get(environment.CUMPLIDOS_DVE_MID_SERVICE, `aprobacion_pago/generar_certificado/${this.NombreOrdenador}/${facultad_homologada}/${dependencia}/${this.MesSeleccionado}/${this.AnoSeleccionado}/${this.PeriodoSeleccionado}`).subscribe({
                  next: (response: Respuesta) => {
                    if (response.Success) {
                      this.popUp.close();
                      this.dialogConfig.data = response.Data as string;
                      this.dialog.open(ModalDocumentViewerComponent, this.dialogConfig);
                    }
                  }, error: () => {
                    this.popUp.error("No se ha podido generar el PDF.")
                  }
                });
              }
            });
          }
        }, error: () => {
          this.popUp.error("No se ha podido consultar la facultad homologada.")
        }
      });
    }
  }

  Acciones(event): void {
    switch (event.action) {
      case "Aprobar": {
        this.Aprobar(event);
        break;
      }
      case "Rechazar": {
        this.Rechazar(event);
        break;
      }
    }
  }

  Aprobar(event): void {
    this.popUp.confirm("Aprobar", "¿Está seguro que desea aprobar el pago?", "aprobar").then(result => {
      if (result.isConfirmed) {
        this.popUp.loading();

        // VARIABLES
        var cumplido: any;
        var parametro: any;

        //CONSULTAR PAGO MENSUAL
        this.request.get(environment.CUMPLIDOS_DVE_CRUD_SERVICE, `pago_mensual/?query=Id:${event.data.PagoMensual.Id}`).subscribe({
          next: (response: Respuesta) => {
            if (response.Success) {
              cumplido = response.Data[0];

              //CONSULTAR EL PARAMETRO
              this.request.get(environment.PARAMETROS_SERVICE, `parametro/?query=codigo_abreviacion:AP_DVE,Nombre:APROBACIÓN PAGO`).subscribe({
                next: (response: Respuesta) => {
                  if (response.Success) {
                    parametro = response.Data;
                    if ((response.Data as any[]).length === 0) {
                      this.popUp.error("No se ha encontrado el parámetro para cambio de estado.")
                    }

                    //CAMBIA EL ESTADO Y AJUSTA VALORES
                    cumplido.EstadoPagoMensualId = parametro[0].Id;
                    cumplido.FechaCreacion = new Date(cumplido.FechaCreacion);
                    cumplido.FechaModificacion = new Date();

                    //ENVÍA A TITAN
                    this.request.post(environment.CUMPLIDOS_DVE_MID_SERVICE, `aprobacion_pago/enviar_titan`, cumplido).subscribe({
                      next: (response: Respuesta) => {
                        if (response.Success) {
                          //APRUEBA LA SOLICITUD
                          this.request.put(environment.CUMPLIDOS_DVE_CRUD_SERVICE, `pago_mensual`, cumplido, event.data.PagoMensual.Id).subscribe({
                            next: (response: Respuesta) => {
                              if (response.Success) {
                                this.popUp.close();
                                this.popUp.success("El pago ha sido aprobado.").then(() => {
                                  window.location.reload();
                                });
                              }
                            }, error: () => {
                              this.popUp.error("No se ha podido aprobar el pago.");
                            }
                          });
                        }
                      }, error: () => {
                        this.popUp.error("No se ha podido aprobar el pago.");
                      }
                    });
                  }
                }, error: () => {
                  this.popUp.error("No se ha podido consultar el parametro.")
                }
              });
            }
          }
        });
      }
    })
  }

  Rechazar(event): void {
    this.popUp.confirm("Rechazar", "¿Está seguro que desea rechazar el pago?", "rechazar").then(result => {
      if (result.isConfirmed) {
        //VARIABLES
        var cumplido: any;
        var parametro: any;

        //CONSULTAR PAGO MENSUAL
        this.request.get(environment.CUMPLIDOS_DVE_CRUD_SERVICE, `pago_mensual/?query=Id:${event.data.PagoMensual.Id}`).subscribe({
          next: (response: Respuesta) => {
            if (response.Success) {
              cumplido = response.Data[0];

              //CONSULTAR EL PARAMETRO
              this.request.get(environment.PARAMETROS_SERVICE, `parametro/?query=codigo_abreviacion:RP_DVE,Nombre:RECHAZO PAGO`).subscribe({
                next: (response: Respuesta) => {
                  if (response.Success) {
                    parametro = response.Data;

                    if ((response.Data as any[]).length === 0) {
                      this.popUp.error("No se ha encontrado el parámetro para cambio de estado.");
                    }

                    //CAMBIA EL ESTADO Y AJUSTA VALORES
                    cumplido.Responsable = cumplido.Persona;
                    cumplido.CargoResponsable = "DOCENTE";
                    cumplido.EstadoPagoMensualId = parametro[0].Id;
                    cumplido.FechaCreacion = new Date(cumplido.FechaCreacion);
                    cumplido.FechaModificacion = new Date();

                    //RECHAZAR LA SOLICITUD
                    this.request.put(environment.CUMPLIDOS_DVE_CRUD_SERVICE, `pago_mensual`, cumplido, event.data.PagoMensual.Id).subscribe({
                      next: (response: Respuesta) => {
                        if (response.Success) {
                          this.popUp.close();
                          this.popUp.success("El pago ha sido rechazado.").then(() => {
                            window.location.reload();
                          });
                        }
                      }, error: () => {
                        this.popUp.error("No se ha podido rechazar el pago.");
                      }
                    });
                  }
                }, error: () => {
                  this.popUp.error("No se ha encontrado el parámetro para cambio de estado.")
                }
              });
            }
          }
        });
      }
    });
  }

  // ELIMINA LOS CMPLIDOS EN EL ARRAY DE APROBACION MULTIPLE
  ClearSelectedCumplidos(): void {
    this.CumplidosSelected = [];
  }


  CumplidosSeleccionados(event): void {
    //VARIABLES
    var parametro: any;
    var cumplido: any;


    if (event.isSelected === null) {
      if (event.selected.length > 0) {
        this.CumplidosSelected = [];
        this.DeshabilitarBoton = true;
        let cumplidosPromises = event.selected.map(cumplido => {
          return new Promise((resolve, reject) => {
            this.popUp.loading();
            this.request.get(environment.PARAMETROS_SERVICE, `parametro/?query=codigo_abreviacion:AP_DVE,Nombre:APROBACIÓN PAGO`).subscribe({
              next: (response) => {
                if (response.Success) {
                  let parametro = response.Data;
                  if (parametro.length === 0) {
                    this.popUp.error("No se ha encontrado el parámetro para cambio de estado.");
                  }
                  //SE CREA EL CUMPLIDO Y SE CAMBIAN VALORES
                  cumplido.PagoMensual.EstadoPagoMensualId = parametro[0].Id;
                  cumplido.PagoMensual.FechaCreacion = new Date(cumplido.FechaCreacion);
                  cumplido.PagoMensual.FechaModificacion = new Date();
                  this.CumplidosSelected.push(cumplido.PagoMensual);
                  resolve(undefined);
                }
              },
              error: (error) => {
                reject(error);
              }
            });
          });
        });

        Promise.all(cumplidosPromises)
          .then(() => {
            this.DeshabilitarBoton = false;
            this.popUp.close();
          })
          .catch(error => {
            this.popUp.error("Error al seleccionar cumplidos").then(() => {
              this.ClearSelectedCumplidos();
              window.location.reload();
            });
            this.DeshabilitarBoton = true;
          });
      }

      if (event.selected.length === 0) {
        this.ClearSelectedCumplidos();
      }
    }
    else {
      if (event.isSelected) {
        this.popUp.loading();
        //CONSULTA EL PARAMETRO
        this.request.get(environment.PARAMETROS_SERVICE, `parametro/?query=codigo_abreviacion:AP_DVE,Nombre:APROBACIÓN PAGO`).subscribe({
          next: (response: Respuesta) => {
            if (response.Success) {
              parametro = response.Data;
              if ((response.Data as any[]).length === 0) {
                this.popUp.error("No se ha encontrado el parámetro para cambio de estado.")
              }
              //SE CREA EL CUMPLIDO Y SE CAMBIAN VALORES
              cumplido = event.data.PagoMensual;
              cumplido.EstadoPagoMensualId = parametro[0].Id;
              cumplido.FechaCreacion = new Date(cumplido.FechaCreacion);
              cumplido.FechaModificacion = new Date();
              this.CumplidosSelected.push(cumplido);
              this.popUp.close();
            }
          }, error: () => {
            this.popUp.error("Error obteniendo parametro").then(() => {
              this.ClearSelectedCumplidos();
              window.location.reload();
            });
          }
        });
      } else {
        //ELIMINA EL CUMPLIDO
        for (var i = 0; i < this.CumplidosSelected.length; i++) {
          if (this.CumplidosSelected[i] != null && this.CumplidosSelected[i].Id === event.data.PagoMensual.Id) {
            delete this.CumplidosSelected[i];
          }
        }
        //VUELVE A ARMAR EL ARRAY SIN ESPACIOS EN BLANCO
        var cont = 0;
        var cumplidos_nuevo = [];
        for (var i = 0; i < this.CumplidosSelected.length; i++) {
          if (this.CumplidosSelected[i] != null) {
            cumplidos_nuevo[cont] = this.CumplidosSelected[i];
            cont++;
          }
        }
        this.CumplidosSelected = cumplidos_nuevo;
      }
    }
  }

  AprobarMultiplesPagos(): void {
    if (this.CumplidosSelected.length === 0) {
      this.popUp.warning("Por favor seleccione un cumplido para aprobar el pago.")
    } else {
      this.popUp.confirm("Aprobar Pagos", "¿Está seguro que desea aprobar el pago para las solicitudes de cumplidos seleccionadas?", "send").then(result => {
        if (result.isConfirmed) {
          this.popUp.loading();
          this.request.post(environment.CUMPLIDOS_DVE_MID_SERVICE, `aprobacion_pago/aprobar_pagos`, this.CumplidosSelected).subscribe({
            next: (response: Respuesta) => {
              if (response.Success) {
                this.popUp.close();
                this.popUp.success("Los cumplidos seleccionados han sido aprobados para el pago").then(() => {
                  this.CumplidosSelected = [];
                  window.location.reload();
                });
              }
            }, error: () => {
              const cumplidosSeleccionadosInfo = this.CumplidosSelected.map(cumplido => `${cumplido.Persona}: ${cumplido.NumeroContrato}`).join('; ');
              this.popUp.error(`No se ha podido aprobar los pagos de los cumplidos seleccionados: ${cumplidosSeleccionadosInfo}`).then(() => {
                this.CumplidosSelected = [];
                window.location.reload();
              }
              )
            }
          });
        }
      });
    }
  }

}
