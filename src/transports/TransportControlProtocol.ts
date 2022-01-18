import Interface from '../Interface';
import ControlProtocol from '../ppp/ControlProtocol';

export default class TransportControlProtocol extends ControlProtocol {
  constructor(
    private intf: Interface,
    private transport: {
      thisLayerUp: () => void;
      thisLayerDown: () => void;
    },
    private ncpProtocol: number,
    displayName: string,
  ) {
    super(displayName);
  }

  public up(): void {
    super.up(this.intf.connect(this.ncpProtocol));
  }

  protected thisLayerUp(): void {
    this.transport.thisLayerUp();
  }

  protected thisLayerDown(): void {
    this.transport.thisLayerDown();
  }
}
