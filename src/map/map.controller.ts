import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { MapService } from './map.service';

@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
    constructor(private readonly mapService: MapService) {}

    @Get('users')
    async getUsers(@Query() query: GetUsersQueryDto) {
        const users = await this.mapService.getUsers({ latitude: query.lat, longitude: query.lng, radiusKm: query.radius, role: query.role });

        return {
            success: true,
            data: users,
        };
    }
}//
