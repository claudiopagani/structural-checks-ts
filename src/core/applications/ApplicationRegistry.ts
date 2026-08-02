export interface ApplicationRegistryApplication<TManifest = unknown, TResult = unknown> {
  readonly id: string;
  readonly getManifest: () => TManifest;
  readonly run: (input?: unknown) => TResult;
}

export class ApplicationRegistry<
  TManifest = unknown,
  TResult = unknown,
  TApplication extends ApplicationRegistryApplication<
    TManifest,
    TResult
  > = ApplicationRegistryApplication<TManifest, TResult>,
> {
  private readonly applications = new Map<string, TApplication>();

  public constructor(applications: readonly TApplication[] = []) {
    for (const application of applications) {
      this.register(application);
    }
  }

  public register(application: TApplication): this {
    if (!application?.id) {
      throw new Error("Cannot register an application without an id.");
    }

    if (this.applications.has(application.id)) {
      throw new Error(`Application ${application.id} is already registered.`);
    }

    this.applications.set(application.id, application);
    return this;
  }

  public has(applicationId: string): boolean {
    return this.applications.has(applicationId);
  }

  public get(applicationId: string): TApplication | null {
    return this.applications.get(applicationId) ?? null;
  }

  public list(): TApplication[] {
    return [...this.applications.values()];
  }

  public listManifests(): TManifest[] {
    return this.list().map((application) => application.getManifest());
  }

  public run(applicationId: string, input?: unknown): TResult {
    const application = this.get(applicationId);

    if (!application) {
      throw new Error(`Unknown application: ${applicationId}`);
    }

    return application.run(input);
  }
}
