import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContactModule } from './contact/contact.module';
import { SteamModule } from './steam/steam.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContactModule,
    SteamModule,
  ],
})
export class AppModule {}
