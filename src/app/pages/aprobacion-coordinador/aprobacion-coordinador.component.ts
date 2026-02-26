import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { LocalDataSource } from 'ng2-smart-table';
import { environment } from 'src/environments/environment';
import { RequestManager } from '../services/requestManager';
import { UserService } from '../services/userService';
import { UtilService } from '../services/utilService';
import Swal from 'sweetalert2';

import { forkJoin, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

import { ModalDocumentViewerComponent } from '../modal-document-viewer/modal-document-viewer.component';
import { Respuesta } from 'src/app/@core/models/respuesta';

interface DatosIdentificacionItem { NomProveedor?: string; }
type DatosIdentificacion = DatosIdentificacionItem[];

@Component({
  selector: 'app-aprobacion-coordinador',
  templateUrl: './aprobacion-coordinador.component.html',
  styleUrls: ['./aprobacion-coordinador.component.scss']
})
export class AprobacionCoordinadorComponent implements OnInit {

  sourceAprobados: LocalDataSource = new LocalDataSource();
  sourcePorAprobar: LocalDataSource = new LocalDataSource();
  selectedRows: any[] = [];

  totalAprobados = 0;
  totalPorAprobar = 0;

  NombreCoordinador = '';
  documentoCoordinador = '';
  Proyectos_Curriculares: any[] = [];

  proyectoSeleccionado: number | null = null;
  vigencia: number | null = null;
  mes: number | null = null;   // num 1-12
  anio: number | null = null;

  Meses = [
    'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
    'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
  ];
  Anos = [new Date().getFullYear()];
  Periodos: any[] = [];

  ProyectoCurricularSeleccionado: any = null;
  MesSeleccionado: any = null;      // string mes
  AnoSeleccionado: any = null;
  PeriodoSeleccionado: any = null;

  dialogConfig: MatDialogConfig;

  private nombreCache = new Map<string, string>();

  settingsAprobados = {
    actions: false,
    selectMode: 'single',
    hideSubHeader: true,
    columns: {
      NumeroContrato: { title: 'Contrato', type: 'string' },
      NombreDocente: {
        title: 'Docente',
        type: 'string',
        valuePrepareFunction: (_c, r) => r?.NombreDocente || '—'
      },
      PersonaId: { title: 'Documento', type: 'number' },
      Vigencia: { title: 'Vigencia', type: 'number' },
      'ResolucionVinculacionDocenteId.Dedicacion': {
        title: 'Dedicación',
        type: 'string',
        valuePrepareFunction: (_c, r) => r?.ResolucionVinculacionDocenteId?.Dedicacion || ''
      }
    }
  };

  settingsPorAprobar = {
    selectMode: 'multi',
    actions: false,
    columns: {
      NumeroContrato: { title: 'Contrato', type: 'string' },
      NombreDocente: {
        title: 'Docente',
        type: 'string',
        valuePrepareFunction: (_c, r) => r?.NombreDocente || '—'
      },
      PersonaId: { title: 'Documento', type: 'number' },
      Vigencia: { title: 'Vigencia', type: 'number' },
      'ResolucionVinculacionDocenteId.Dedicacion': {
        title: 'Dedicación',
        type: 'string',
        valuePrepareFunction: (_c, r) => r?.ResolucionVinculacionDocenteId?.Dedicacion || ''
      }
    }
  };

  constructor(
    private request: RequestManager,
    private popUp: UtilService,
    private userService: UserService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {
    this.GenerarPeriodos();

    this.dialogConfig = new MatDialogConfig();
    this.dialogConfig.width = '1200px';
    this.dialogConfig.height = '800px';
    this.dialogConfig.data = {};
  }

  async ngOnInit(): Promise<void> {
    await this.consultarNumeroDocumento();
    await this.consultarCoordinador();
  }

  GenerarPeriodos(): void {
    const AnoActual = new Date().getFullYear();
    const AnoProximo = AnoActual + 1;
    this.Periodos[AnoActual] = [AnoActual + '-3', AnoActual + '-2', AnoActual + '-1'];
    this.Periodos[AnoProximo] = [AnoProximo + '-3', AnoProximo + '-2', AnoProximo + '-1'];
  }

  async consultarNumeroDocumento() {
    return new Promise((resolve) => {
      this.userService.user$.subscribe((data: any)=> {
        if (data?.userService?.documento) {
          this.documentoCoordinador = data.userService.documento;
          resolve(undefined);
        }
      });
    });
  }
  async consultarCoordinador() {
    return new Promise((resolve) => {
      this.request.get(
        environment.ACADEMICA_JBPM_SERVICE,
        `coordinador_carrera_snies/${this.documentoCoordinador}`
      ).subscribe({
        next: (response: any) => {
          if (response?.coordinadorCollection?.coordinador) {
            this.NombreCoordinador =
              response.coordinadorCollection.coordinador[0].nombre_coordinador;
            this.Proyectos_Curriculares =
              response.coordinadorCollection.coordinador;
          }
          resolve(undefined);
        },
        error: () => resolve(undefined)
      });
    });
  }

  consultarDocentes() {
    if (!this.proyectoSeleccionado || !this.vigencia || !this.mes || !this.anio) {
      Swal.fire('Error', 'Debe seleccionar todos los filtros', 'warning');
      return;
    }

    this.popUp.loading();

    const endpoint =
      `informacion_academica/docentes_coordinador/51` +
      `/${this.vigencia}/${this.mes}/${this.anio}`;//${this.proyectoSeleccionado}

    this.request.get(environment.CUMPLIDOS_DVE_MID_SERVICE, endpoint).subscribe({
      next: (response: any) => {
        const dataRaw = response?.Data || [];
        const data = Array.isArray(dataRaw) ? dataRaw : [];

        const aprobados = data.filter(d => d?.PagoMensual === true);
        const porAprobar = data.filter(d => !d?.PagoMensual);

        this.totalAprobados = aprobados.length;
        this.totalPorAprobar = porAprobar.length;

        this.sourceAprobados = new LocalDataSource(aprobados);
        this.sourcePorAprobar = new LocalDataSource(porAprobar);
        this.selectedRows = [];

        this.popUp.close();

        this.enriquecerNombresDocentesAsync(data);
      },
      error: () => {
        this.popUp.close();
        Swal.fire('Error', 'No se pudo consultar docentes', 'error');
      }
    });
  }

  private enriquecerNombresDocentesAsync(docentes: any[]) {
    const docsUnicos = Array.from(new Set(
      (docentes || []).map(d => String(d.PersonaId)).filter(Boolean)
    ));

    const pendientes = docsUnicos.filter(doc => !this.nombreCache.has(doc));

    if (pendientes.length === 0) {
      this.actualizarTablasConNombres(docentes);
      return;
    }

    const calls = pendientes.map(doc =>
      this.request.get(
        environment.ADMINISTRATIVA_AMAZON_SERVICE,
        `informacion_proveedor?query=NumDocumento:${doc}`
      ).pipe(
        timeout(6000),
        map((datos: DatosIdentificacion) => ({
          doc,
          nombre: datos?.[0]?.NomProveedor || ''
        })),
        catchError(() => of({ doc, nombre: '' }))
      )
    );

    forkJoin(calls).subscribe({
      next: (results) => {
        results.forEach(r => this.nombreCache.set(String(r.doc), r.nombre || ''));
        this.actualizarTablasConNombres(docentes);
      },
      error: () => {
        this.actualizarTablasConNombres(docentes);
      }
    });
  }

  private actualizarTablasConNombres(docentes: any[]) {
    const enriched = (docentes || []).map(d => ({
      ...d,
      NombreDocente: this.nombreCache.get(String(d.PersonaId)) || ''
    }));

    const aprobados = enriched.filter(d => d?.PagoMensual === true);
    const porAprobar = enriched.filter(d => !d?.PagoMensual);

    this.totalAprobados = aprobados.length;
    this.totalPorAprobar = porAprobar.length;

    this.sourceAprobados = new LocalDataSource(aprobados);
    this.sourcePorAprobar = new LocalDataSource(porAprobar);

    this.cdr.detectChanges();
  }

  onUserRowSelect(event: any) {
    this.selectedRows = event?.selected || [];
  }

  aprobarSeleccionados() {
    if (this.selectedRows.length === 0) {
      Swal.fire('Info', 'Seleccione al menos un docente', 'info');
      return;
    }

    const payload = {
      coordinador: String(this.documentoCoordinador),
      docentes: this.selectedRows.map(d => ({
        persona: String(d.PersonaId),
        numero_contrato: String(d.NumeroContrato),
        vigencia_contrato: Number(d.Vigencia),
        mes: Number(this.mes),
        anio: Number(this.anio)
      }))
    };

    this.popUp.confirm(
      'Aprobar',
      `Se aprobarán ${payload.docentes.length} docentes`,
      'send'
    ).then(result => {
      if (!result.isConfirmed) return;

      this.popUp.loading();

      this.request.post(
        environment.CUMPLIDOS_DVE_MID_SERVICE,
        `aprobacion_documentos/enviar_aprobar_solicitudes_coordinador`,
        payload
      ).subscribe({
        next: (resp: any) => {
          this.popUp.close();
          if (resp?.Success) {
            this.popUp.success('Docentes aprobados').then(() => this.consultarDocentes());
          } else {
            Swal.fire('Error', resp?.Message || 'Error', 'error');
          }
        },
        error: () => {
          this.popUp.close();
          Swal.fire('Error', 'No se pudo aprobar', 'error');
        }
      });
    });
  }

  GenerarCertificado(): void {
    if (
      this.ProyectoCurricularSeleccionado === null ||
      this.MesSeleccionado === null ||
      this.AnoSeleccionado === null ||
      this.PeriodoSeleccionado === null
    ) {
      this.popUp.warning('Se deben de seleccionar todos los campos para generar el certificado.');
      return;
    }

    let Oikos: any = null;
    let ProyectoCurricular: any = null;
    let Facultad: any = null;

    this.popUp.loading();

    this.request.get(
      environment.DEPENDENCIAS_SERVICE,
      `proyecto_curricular_snies/${this.ProyectoCurricularSeleccionado}`
    ).subscribe({
      next: (response: any) => {
        Oikos = response?.homologacion?.id_oikos;
        ProyectoCurricular = response?.homologacion?.proyecto_snies;

        this.request.get(
          environment.OIKOS_SERVICE,
          `dependencia_padre/?query=Hija:${Oikos}`
        ).subscribe({
          next: (responseOikos: any) => {
            Facultad = responseOikos?.[0]?.Padre?.Nombre || '';
            ProyectoCurricular = (ProyectoCurricular || '').replace(/,/g, '');

            this.request.get(
              environment.CUMPLIDOS_DVE_MID_SERVICE,
              `aprobacion_documentos/generar_certificado/` +
              `${this.NombreCoordinador}/${ProyectoCurricular}/${Oikos}/${Facultad}/` +
              `${this.MesSeleccionado}/${this.AnoSeleccionado}/${this.PeriodoSeleccionado}`
            ).subscribe({
              next: (resp: Respuesta) => {
                if (resp?.Success) {
                  this.popUp.close();
                  this.dialogConfig.data = resp.Data as string;
                  this.dialog.open(ModalDocumentViewerComponent, this.dialogConfig);
                } else {
                  this.popUp.error('No se ha podido generar el PDF.');
                }
              },
              error: () => this.popUp.error('No se ha podido generar el PDF.')
            });
          },
          error: () => this.popUp.error('No se ha podido generar el PDF.')
        });
      },
      error: () => this.popUp.error('No se ha podido generar el PDF.')
    });
  }
}