import { Instance as i } from "cs_script/point_script";
import {
	Vehicle,
	Seat,
	CSInputs
} from "./core";

i.SetThink(() => {
	while (Seat.newOccupantsQueue.length){
		const seat = Seat.newOccupantsQueue.pop();
		seat.occupant.SetParent(seat.seatIn);
		seat.teleportOccupant();
	}

	for (const vec of Vehicle.occupiedVecs)
		if (!vec.body.IsValid())
			vec.deoccupy();

	for (const [_, seat] of Seat.occupiedSeats){
		seat.damage();

		// driving
		if (seat.isDriver()){
			seat.vehicle.drive(
				seat.occupant.IsInputPressed(CSInputs.FORWARD) && !seat.occupant.IsInputPressed(CSInputs.BACK),
				seat.occupant.IsInputPressed(CSInputs.BACK) && !seat.occupant.IsInputPressed(CSInputs.FORWARD),
				seat.occupant.IsInputPressed(CSInputs.RIGHT) && !seat.occupant.IsInputPressed(CSInputs.LEFT),
				seat.occupant.IsInputPressed(CSInputs.LEFT) && !seat.occupant.IsInputPressed(CSInputs.RIGHT)
			);
		}

		seat.floor?.Teleport({position: seat.seatIn.GetAbsOrigin(), angles: seat.seatIn.GetAbsAngles()});
		seat.occupant.Teleport({position: seat.seatIn.GetAbsOrigin()});

		seat.damage();
	}
	i.SetNextThink(i.GetGameTime());
});
i.SetNextThink(i.GetGameTime());
